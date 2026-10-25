# vmu 11 · 开发与门禁（Development & Gates）

> 状态：**草案 v0.1**
> 上位：`01-philosophy.md`（R13 门禁即文档 / R12 可复现 / R14 无屎山）、`00-README.md` §4/§6
> 一句话：**每一句"我们做到了"，都必须能指向一条会变红的检查** ✗✓。

---

## 1. 门禁的六类（缺一类就不算覆盖）

| 类型 | 手段 | 典型对象 | 红的标准 |
|---|---|---|---|
| **S 静态门** | 读源码/清单文本断言形状与登记一致性 | 命名、登记完整性、零策略词表、模块规模、schema 单一源 | 断言失败 ⇒ 具名打印**哪一条**违反 |
| **B 行为场景** | mock 宿主驱动真实插件 | 会议/表决/归档/预算/中间件/控制流 | 场景退出码非 0 且**带具名失败行** |
| **M 变异族** | 对源码做**单点变异**，要求场景**按名变红** | 每条机制至少 1 个反向变异 | `no named red` / `HANG` / `anchor x0` 均算失败 |
| **C 语料快照** | 逐字快照（提示词/回显/文档计数） | 提示词管线、状态面、README 计数 | 漂移未显式更新 ⇒ 红 |
| **T 契约门** | 公共面一致性（03 ↔ 实现 ↔ 文档） | 服务/工具/钩子/耐久键/错误码 | 悬空引用、未登记符号 ⇒ 红 |
| **E 端到端** | 真机/宿主内验收 | 安装、预设装载、GUI 可选 | 未通过 ⇒ 记为 NON-RESULT（不得当通过） |

---

## 2. R1..R15 ↔ 门禁 双向映射（**必须无空缺**）

> ★★★ **读法警告（轮 454 加、轮 468 补"为什么保留" ✓）** ✓：★ **本表有意保留【草案 id**]✓（★ **与 §2.1 的差别是【有意的**]✓：★ **本表说"哪类门禁【应当**]负责哪条要求"** ✓，**§2.1 说"今天哪个文件【在跑**]"** ✓ ⇒ ★★ **两张表回答两个问题，不要互相当替身** ✓）；★ **本表的 id 是设计阶段的草案 id** ✓，**不是活的作业名** ✗ ⇒ ★★ **用 `grep` 去测试树里找它们会【一个都找不到**]✓（★ **本轮就这么做过，并一度以为这张覆盖表是虚构的** ✗）⇒ ★ **它们表达的是"哪个门禁族负责哪条要求"** ✓，**真正的族名在 §2.1 的可追溯表与 `tests/` 里** ✓。★★ **教训**：★ **一张没有任何门禁校验的 id 表，会让下一位读者把"找不到"读成"不存在"** ✓ —— ★ **本注存在的意义就是省掉他这一次误判** ✓。

| 要求 | 门禁（草案 id） | 怎么红 |
|---|---|---|
| **R1 内核零策略** | `S-zpolicy` | 内核源码出现代际/角色/机制专名（词表见 §4）⇒ 红；且"完成判据/门槛"硬编码 ⇒ 红 |
| **R2 能力与挂点齐备** | `T-surface` ＋ `B-cap-*` | 六域能力/钩子缺登记 ⇒ 红；每域"可用"与"可挂"场景缺一 ⇒ 红 |
| **R3 四可** | `S-schema` ＋ `B-set-*` ＋ `C-status` | 有键无 schema／无回显／无热改场景／无审计 ⇒ 红 |
| **R4 设置单一源** | `S-schema` ＋ `C-docgen` | 未声明键被读 ⇒ 红；参数表与 schema 不一致 ⇒ 红 |
| **R5 中间件四形态** | `B-mw-{rules,module,script,plugin}` ＋ `M-mw-*` | 任一形态缺示例/缺变异族 ⇒ 红 |
| **R6 钩子契约化** | `T-hooks` | 代码钩子点 ↔ 05 表 ↔ 03 索引 三处不一致 ⇒ 红 |
| **R7 稳定内部接口** | `S-api` ＋ `T-surface` | 上层引用内核私有符号 ⇒ 红；公开服务缺 `apiVersion` ⇒ 红 |
| **R8 提示词可管理** | `C-corpus` ＋ `B-prompt-*` | 快照漂移未声明／绑定与覆盖无场景 ⇒ 红 |
| **R9 归档与记忆** | `B-lib-*` | 指纹/悬空拒/分轨/截断计数 任一缺 ⇒ 红 |
| **R10 耐久可信** | `B-store-*` ＋ `S-nolog` | 并发丢写／迁移失败仍启动／**写会话日志** ⇒ 红 |
| **R11 可观测** | `C-status` ＋ `B-refuse-*` | 拒绝不带具名原因／状态面缺字段 ⇒ 红 |
| **R12 可复现** | `B-determinism` | 同 seed 两次不一致 ⇒ 红 |
| **R13 门禁即文档** | 本表自身（`S-map`） | 本表出现空缺／悬空门禁 id ⇒ 红 |
| **R14 无屎山** | `S-size` ＋ `S-import` | 单文件超限／跨模块私访／循环依赖 ⇒ 红 |
| **R15 可迁移** | `B-parity-v5r` ＋ `C-parity-report` | 对照未跑／差异未分类 ⇒ 红 |

---

### 2.1 可追溯表（**一行一表**，仿 v5r `12-traceability` 范式：便于正则守卫 ✓）

> ★★★ **对齐的【强度**]必须说清（轮 456／457 ✓；★ 轮 468 更新 ✓）**：★★ **十五行【全部读完**]✓ —— ★ 其中 **15 行都找到了真实门禁文件** ✓（★ R1 由轮 462 立门禁 ✓、★ **其违规由轮 466 修复、积压为空** ✓）；★★ **R2／R5／R6／R7 等八行额外点出了【断言行与它断言什么**]✓（★ 强度分层：要么有证据，要么明确"没有门禁" ✓，**中间态已消失** ✓ —— ★ 见各行 ✓）。
> ★★★ **列名的读法（轮 455 加、轮 468 更新 ✓）** ✓：★★ **本表的「门禁 id」【最初**]是设计阶段的草案 id** ✗（★ 21 个在 `tests/` 里一个都找不到 ✓ —— ★ **列名却直接写着"门禁 id"** ✗ ⇒ ★ 用 `grep` 核对的人会把"找不到"读成"没做" ✓）；★★★ **轮 456 已把该列【换成真实文件**]✓（★ 每行指向 `tests/…` ✓，**并逐行标明强度** ✓）⇒ ★ **现在本列是可核对的** ✓。★★ **而 §2 的表【仍保留草案 id**]✓ —— ★ **这是有意的差别** ✓：★ **§2 表达"哪类门禁负责哪条要求"**（★ 设计意图 ✓），**§2.1 表达"今天哪个文件在跑"**（★ 现状 ✓）⇒ ★★ **两张表回答两个问题，不要互相当替身** ✓。

> 每行**一条**：`要求 → 门禁 id → 文档落点 → 场景/族命名约定`。命名约定是**可机器检查**的：门禁实现后，场景名与族名必须按此拼写，否则红 ✓。

| 要求 | 门禁 id（★★★ **右边一栏是【轮 456 对齐后的真实作业族**]✓） | 文档落点 | 场景/族命名约定 |
|---|---|---|---|
| R1 内核零策略 | ★★★ **已有门禁，且【违规已修复、积压为空**]✓✓（★ 轮 462 立门禁 ✓、★ **轮 466 修复** ✓，`tests/audit-zpolicy.test.mjs` 9/9 ✓）—— ★★ **O5 已裁** ✓（★ 你裁定："细化后立门禁：只查代码，兼容站点录成冻结名单" ✓）：① **代际词面【严格为零**]✓ —— ★ 剥离注释与字符串后 **86 个内核文件命中 0** ✓（★ 原始计数 20 ✗ ⇒ **全在注释／字符串／文档里** ✓）；★★ **"解释一条兼容路径为什么存在，不是策略"** ✓；★ **辨别力两个方向都被证明** ✓。② ★★★ **角色面也已【归零**]✓，**而根因是一处【缺失的字段**]，不是一个多余的常量** ✗→✓：★ 那张硬编码的角色名映射（`academician:'院士'`／`researcher:'常驻研究员'`／`temp:'临时工'` ✗）**不是**设计选择 —— ★★ **`open()` 用【逐字段列表**]构造 `turn`，**而 `roleLabel` 不在其中** ✗ ⇒ **`turn.roleLabel` 永远是 `undefined`** ✓ ⇒ **内核【不得不**]保留一张映射来填任何标题** ✓ ⇒ ★★★ **"显示用的名字与框架的词汇，是被【一个缺失的字段**]纠缠在一起的。"** ✓；★★ **修复**：**`open()` 解构并带上 `roleLabel`** ✓ ＋ **映射删除** ✓ ＋ **名字归调用方**（★ pack 在真实使用时给 ✓、★ 回合套件现在在 41 处给 ✓）⇒ ★★ **`vmu-turn` 141/4 → 145/0** ✓；★★★ **积压【空**]✓ —— ★ **"它冻结的那一处是被【修好的**]，不是被豁免的，★ 而这正是那个门禁被造出来就是为了到达的状态。"** ✓ | ★ 待补 | ★ 待补 |
| R2 能力齐备 | ★★★ **已读并证明** ✓ **`tests/vmu-host-hooks.test.mjs`**（★ **"什么都不声明 ⇒ 桥不计划任何钩子"** ✓、★ **"声明的宿主钩子被桥接"** ✓、★ **"注册经过 `ctx.effect` 并带标签 `vmu:hook:…`"** ✓、★ **deny／allow／cancel／ask 四种决策都映射到宿主** ✓、★ **不支持的请求记入 `refusedUnsupported`** ✓ ⇒ **能力"可用"与"可挂"两半都有断言** ✓）＋ `tests/audit-registration.mjs`（★ L69：**每个注册工具都必须满足宿主的强制输出契约** ✓） | 02-§2／03-§2 | `s-cap-<area>-usable`／`s-cap-<area>-hookable` |
| R3 四可 | ★★★ **已读并证明** ✓ **`tests/vmu-settings.test.mjs`** —— ★★ **它的自述【逐字点名 R3**]✓：**"This is the first vmu test job. It proves the four-可 contract (docs/01 R3: declarable, readable, changeable, auditable)"** ✓ ⇒ ★ **四个"可"各有断言，是 R3 最直接的证据** ✓；＋ `tests/audit-settings-channels.test.mjs`（★ 自述：**"gate for the TWO-READING-CHANNEL class and the zero-mechanism matrix"** ✓ ⇒ ★ **"有键但读不到／读了不生效"这一类是它的红** ✓） | 04-§2／04-§11 | `s-set-<key>-echo`／`-reject`／`-hot`／`-audit` |
| R4 单一源 | ★★★ **已读并证明** ✓ **`tests/vmu-planned-settings.test.mjs`** —— ★ 自述：**"生成的注册表【恰好就是文档产出的东西**]（`--check` 会拒）"** ✓ ⇒ ★★ **"单一源"被理解为"文档与注册表是同一个源"，这是它的正面判据** ✓；＋ `tests/vmu-setting-rename.test.mjs`（★ 重命名通道：**三阶段改名** ✓ ⇒ ★ **改名的单一源也是它** ✓）＋ `tests/audit-settings-roundtrip.test.mjs`（**往返** ✓） | 04-§3 | `s-docgen-table-eq-schema` |
| R5 四形态 | ★★★ **已读并证明** ✓ **`tests/audit-seam-reachability.test.mjs`**（★ 自述原文：**"一个 seam 被【接线了但它的消费者从未使用它**]"，**它管四个能力 seam** ✓ ⇒ ★ **"有形态但没人用"正是 R5 要防的红** ✓）＋ **三个形态各自的场景**：★ `tests/vmu-bus.test.mjs`（M1：★ **条目静态校验、重复 id 具名拒** ✓）、★ `tests/vmu-script.test.mjs`（M3：★ **子进程接缝注入，无宿主即具名拒** ✓）、★ `tests/vmu-script-bridge.test.mjs`（M3 桥 ✓） | 05-§3 | `s-mw-{rules,module,script,plugin}`＋`m-mw-*` |
| R6 钩子契约化 | ★★★ **已读并证明** ✓ **`tests/vmu-loader.test.mjs`**（★ L90-97：**拼错的钩子 `meeting/round-strat` 在【装载期被拒**]✓ —— ★ 断言原文是 **"a misspelled hook is refused at load time, not silently ignored"** ✓；★ **`isRegisteredHook` 认得 vmu 钩子／宿主基底钩子／`workflow/*`，而拼错与空名不认得** ✓；★ **文档化的宿主钩子被接受且登记进 `hooks[]`** ✓ ⇒ **"代码钩子点 ↔ 05 表 ↔ 03 索引 三处一致"里的【代码那一侧有门禁**]✓）＋ `tests/vmu-turn.test.mjs` | 05-§4 | `s-hooks-registry-eq-code` |
| R7 稳定接口 | ★★★ **已读并证明** ✓ **`tests/audit-vmu-services.test.mjs`**（★ 自述原文：**"已注册的服务必须真的被【构造**]，**而每个被构造的面必须被【注册并暴露**]"** ✓ ⇒ ★ **这正是"上层不得引用私有符号"的正面判据：凡公开者必须注册，凡注册者必须存在** ✓）＋ `tests/audit-vmu-orphan-methods.test.mjs`（★ **"一个声明的能力必须点出两样东西"** ✓ ⇒ **孤儿方法即红** ✓）＋ `tests/audit-code-status.test.mjs`（★ **生成的逐码状态报告必须与源码树一致** ✓） | 03-§7 | `s-api-no-private-access` |
| R8 提示词可管理 | ★★★ **已读并证明** ✓ **`tests/vmu-prompt.test.mjs`**（★ 自述：**"段以 kebab-case 名注册、落在保留的 order 区间内"** ✓ ⇒ ★ **"可管理"的一半是【段的注册规范**]✓）＋ **`tests/vmu-prompt-v5r-bridge.test.mjs`**（★ 自述：**"v5r 的提示词【文本**]，由【框架自己的流水线**]装配"** ✓ ⇒ ★ **另一半是"语料文本由框架装配、而非包外硬编码"** ✓ —— ★ 这正是 R8 说的"快照漂移"要防的 ✓）＋ `tests/audit-prompt-invariants.mjs`（★ 不变量 ✓） | 06-§3／06-§4 | `c-prompt-<pack>-<role>-<phase>` |
| R9 归档与记忆 | ★★★ **已读并证明** ✓ **`tests/vmu-library.test.mjs`**（★ 自述：**"这个模块存在的四条教训，每条都对着它要防的失败模式验证"** ✓ ⇒ ★ **"指纹／悬空拒／分轨／截断计数"四件事各有其反面** ✓）＋ `tests/vmu-library-revisions.test.mjs`（★ **修订写路径：提交→列→读回→剪一枝→再提交** ✓）＋ `tests/vmu-memory.test.mjs`（★ **记忆与知识面** ✓，★ 规格源 `docs/17 §9／§21.2` ✓） | 07-§4 | `s-lib-{fingerprint,dangling,tracks,truncation}` |
| R10 耐久可信 | ★★★ **已读并证明** ✓ **`tests/vmu-store.test.mjs`**（★ 自述：**"文档承诺的四个场景，每一个都系在本仓的一个真实缺陷上"** ✓ ⇒ ★ **"并发丢写／迁移失败仍启动"在其中** ✓）＋ `tests/vmu-storepolicy.test.mjs`（★ 存储后端策略面 ✓）＋ `tests/vmu-transaction.test.mjs`（★ **append-only 精神 ＋ 事务** ✓，★ 规格源 `docs/07／08` ✓） | 07-§1／07-§3 | `s-store-{concurrent,recover,migrate,no-session-log}` |
| R11 可观测 | ★★★ **已读并证明** ✓ **`tests/audit-code-status.test.mjs`**（★ 自述：**"`03-§8.1` 的【生成**]逐码状态报告必须与源码树一致"** ✓ ⇒ ★ **"状态面缺字段"这一类是它的红** ✓）＋ `tests/vmu-metrics.test.mjs`（★ **三层可观测 ＋ 指标** ✓，★ 规格源 `docs/21 §1／§4` ✓）＋ `tests/audit-status-report-fields.mjs`（★ **无自述** ✗ ⇒ ★ 按名字对齐，未读出它断言什么 ✓） | 03-§8／04-§2 | `s-refuse-named-<code>` |
| R12 可复现 | ★★★ **已读并证明** ✓ **`tests/vmu-replay.test.mjs`**（★ 自述：**"PURITY/DETERMINISM：同一个 plan 应用…"** ✓ ⇒ ★ **"同 seed 两次不一致 ⇒ 红"的骨架就在这里** ✓）＋ `tests/vmu-idempotency.test.mjs`（★ **"身份只算一次；存储指纹…"** ✓）＋ `tests/vmu-repropack.test.mjs`（★ 复现包 ✓） | 01-§3.1／11-§4.1 | `s-determinism-<area>-twice` |
| R13 门禁即文档 | ★★★ **已读并证明** ✓ **四个门禁，自述各自点名它防的缺陷类**：★ `tests/audit-readme-counts.mjs`（**"已出货文档里引用的数字是【派生**]的、不是手打的，**且每个都标明是作业计数还是文件计数"** ✓）、★ `tests/audit-artifact-docs.mjs`（**"README 不得点名某个预设【不写**]的产物，**且必须点名它写的**]"** ✓）、★ `tests/audit-docs-entry-template.mjs`（**"每个能力条目必须带成熟度标记"** ✓）、★ `tests/audit-cross-volume-refs.mjs`（**"每个跨卷小节指针是否都能解析"** ✓ —— ★ 它曾在 518 处里抓到一个悬空引用 ✓） | 11-§2／11-§2.1 | `s-map-no-gap`（本表自身可被解析校验） |
| R14 无屎山 | ★★★ **五个面【全部有门禁**]✓✓；★★★ **积压 4 → 3**（★ 轮 470 ✓）—— ★ **逐面**：① **路径纪律** ⇒ `tests/audit-path-discipline.mjs` ✓；② **文字不得重复存在** ⇒ `tests/audit-prompt-duplication.mjs` ✓；③ **临时卫生** ⇒ `temp-hygiene.mjs` ✓；④ **单文件超限** ⇒ `tests/audit-code-size.test.mjs` ✓（★ 阈值用 `docs/02` 已裁的 **≤1200 行** ✓；★★ **分级积压**：记录、**不得增长**、**每只必须仍然超限**、**谓词被证明能触发** ✓）；⑤ **依赖环** ⇒ `tests/audit-dependency-cycles.test.mjs` ✓（★ 严格 ✓；★ 实测 **105 文件／128 边／0 环** ✓）。★★★ **剩下的三只【是契约，不是普通代码**]✗，**契约逐条读过** ✓：★ **`settings/schema.js`** —— ★ **它的【文本本身】**被对比** ✓（★ `scripts/generate-wired-schema.mjs` 的原话：**"DRIFT: `settings/schema.js` is not what the modules yield"** ✓）**＋ 3 个测试按文本读它** ✓ ⇒ **它的内容必须原样出现在那个文件里** ✓；★ **`math-computation.js`** —— ★★ **与【原始那份**]**（`vibe-math-v2/math-computation.js` ✓）**做对照** ✓（★ `audit-math-computation-parity` 与 `audit-math-computation-contract` 读的都是 **v2 那份** ✓）⇒ **拆任何一边都会破坏对照** ✓；★ **`kernel/index.js`** —— ★ **被按文本解析** ✓（★ `generate-seam-table.mjs` 的 `--kernel` 选项 ✓，**而那是故障注入证明所依赖的特性** ✓）。★★ **已拆的那只**：★ **`v5r-charter.js`**（★ 690 ＋ 700 ＋ 84 ✓，**等价性被证明：57 块 ＝ 22 ＋ 35、逐元素顺序一致** ✓）。★★★ **方法论（轮 470 两次计数都错，方向相反）**：★ **"按文本读"的契约会【藏在变量后面**]✗ ⇒ ★★ **留下的不是数字，而是方法：先按名字找提及、【再逐个读它怎么用这个名字**]。"** ✓ | ★ 待补 | ★ 待补 |
| R15 可迁移 | ★★★ **已读并证明** ✓ **`tests/vmu-containment.test.mjs`**（★ 自述：**"证明 v5r 的行为核【在框架【现况**]下就能跑**]—— ★★ **这是 P3 报告的主张，被做成了可执行的**"** ✓ ✓）＋ `tests/accept-v5r-contrast-behaviour.test.mjs`（**行为级对照：五个行为设置逐条比** ✓）＋ `tests/vmu-ab-v5r-verification.test.mjs`（**"验证【链**]，在 v5r 一侧端到端驱动"** ✓） | 10-§5 | `b-parity-<scenario>`／`c-parity-report-classified` |

**自身可校验性**：`s-map-no-gap` 解析**本表**（一行一条）⇒ ① R1..R15 全覆盖；② 每个门禁 id 在 11-§2 出现；③ 每个文档落点存在 ⇒ 任一不满足即红 ✓（这正是"门禁即文档"的自指闭环 ✓）。

---

## 3. 每篇文档的验收判据索引（与 00-§3 联动）

| 文档 | 它承诺什么 | 对应门禁 |
|---|---|---|
| 03 接口契约 | 公开面 = 实现 = 文档 | `T-surface`、`S-api`、`S-map` |
| 04 设置 | 四可 ＋ 单一源 | `S-schema`、`B-set-*`、`C-docgen` |
| 05 中间件 | 四形态 ＋ 钩子契约 ＋ 失败语义 | `T-hooks`、`B-mw-*`、`M-mw-*` |
| 06 提示词 | 段/绑定/覆盖/快照 | `C-corpus`、`B-prompt-*` |
| 07 耐久归档 | 不丢写、可恢复、指纹、截断计数 | `B-store-*`、`B-lib-*` |
| 08 原语 | 零策略 ＋ 判定点可接管 ＋ 拒绝不污染 | `S-zpolicy`、`B-meeting-*` |
| 09 数学形式化 | 缺席降级、身份一致、编译失败≠否定 | `B-math-*` |
| 10 整合包 | 装载/冲突/对照/接线 | `B-pack-*`、`B-parity-v5r` |

---

## 4. "零策略"词表（`S-zpolicy`；★★★ **O5 已裁：采纳并细化** ✓ —— ★ 见 `tests/audit-zpolicy.test.mjs` ✓）

- **代际词**：`v5r`、`v5`、`v4`、`v3`、`v2`、`vibe-math-vN`（出现在**内核**目录即红；出现在 `packs/**` 则正常）；
- **角色专名**：`院士`、`academician`、`研究员`、`临时工`、`temp`；
- **机制专名**：`求真表决`、`冻结期`、`论文`、`纪要`、`复议`、`附议`…
- **例外机制**：内核契约里**允许**出现的**通用词**（`member`/`role slot`/`ballot`/`meeting`/`stage`/`record`…）；
- **词表维护**：新增限制**必须**同时更新本文与 `S-zpolicy` 的例外清单，否则误报/漏报。

---

## 4.1 环境接缝（Seam）门禁（**新增硬要求**，源于 2026-10-09 实测）

**事实**：本机 **LaTeX 在 `D:\texlive\2025\bin\windows\`、Lean 在 `D:\.elan\bin\`，均在 PATH 上**；而仓库测试里那条 `★ no LaTeX on this host` 之所以存在，是因为**运行器用 `V*_TEX_ROOTS_SANDBOX` 把引擎根 pin 成空**（并另有 I20 门要求"每个探测点都受该接缝管辖"＋对应变异族）。

**⇒ vmu 的三条硬要求**
1. **一切外部能力（引擎/PATH/版本/编译/网络/时钟/随机）都必须经可注入接缝**；产品代码**不得**直接读 `PATH`/`env` 下判定（必须先过接缝）；
2. **"存在"与"缺席"两条路径都必须能在任意机器上确定性复现**（注入假引擎 / 注空根）；
3. **接缝本身要门禁**：探测点绕过接缝 ⇒ 红；并给"绕过 ⇒ 不能再 pin 出缺席态"的变异族（照抄 I20 做法）。

**上报口径纪律**（本轮实测踩到）：`★ … on this host` 一类断言在 **runner 里**（有沙箱）与**直接单跑脚本时**（无沙箱）结果相反 ⇒ 报告必须写明**隔离跑/全量跑**与**是否带沙箱接缝**，否则会把"环境差异"误报成"产品缺陷" ✗✓。

---

## 4.2 守卫面清单（**新增硬要求**，源于第 18 轮系统扫描：守卫"接了≠生效" ✗✓）

**事实**（批评者实测：运行时取 `kernel` 面**的全部成员**（★ **本处原先写 **86** ✓ —— ★ 而轮 511 实调 `createKernel({...})` 得 **109** 个成员** ✗ ⇒ ★★ **改为指向运行时**：★ **要这个数就 `Object.keys(createKernel({...}))`** ✓，★ 因为它是**随模块增长而增长的** ✓），比对**生产代码** vs **测试**引用）：`requireStore()` **生产 0 次**（测试 2 次）、`requireMembers()` **生产 0 次**（测试 10 次）、`settingsView()` **生产 0 次**（测试 2 次）⇒ **守卫被实现、被测试覆盖，却没有任何生产路径调用它** ⇒ 在真实运行里**永远不生效**（第八例）。

**⇒ 两条硬要求**
1. **每个守卫面都必须登记在本节**（面 ⇒ 语义 ⇒ **生产是否调用** ⇒ 诊断面则写明理由 ✓）。**新增守卫面若不登记 ⇒ 门禁红**（`tests/vmu-kernel.test.mjs` 扫 `kernel/index.js` 的 `require*`／`settingsView` 面并比对 `status().guards.registered`，另有变异自证"造一个未登记守卫 ⇒ 红" ✓）。
2. **`status()` 不得声称守卫已生效而实际不生效** ✗✓：`status().guards` 必须报告 `kind`（`contract`／`diagnostic`）、`productionCallSites` 与（诊断面的）`reason`；`contractCount`／`diagnosticCount` 分开计数。

**⇒ 第三条硬要求（★ R5 新增，源于 U14 overlay 的双向误判）**：**`dsh --dump-config` 输出的是「loader 树」，不是「运行时定义」** ⇒ **禁止**用"dump 里出现／没出现某字符串"判定"某个声明/配置**是否生效**；**凡是"合并／覆盖"类语义，必须在运行时断言**（驱动被测模块的 `apply()`／读取它真正交给下游的定义）。本轮**两个方向都误判过**：**假阳性**——patch 的原文出现在 dump 里，被当成"已合并进内层行"；**假阴性**——合并发生在**注册期**，dump **照不出来**，被当成"机制不工作"。正确判据＝**运行时深比较**（`tests/audit-preset-overlay-merge.test.mjs`：驱动 `preset-declaration.apply()` ⇒ 捕获 `agentPresets.register` 收到的定义 ⇒ 断言内层行合并且**原有字段保留**、其它行不动、定义里**不残留** overlay 键、未匹配 key **具名告警且定义不变**；★ 该测试每个用例都用**独立模块实例**，因为 overlay 注册表是**模块级**的）。dump 只可用于**身份/结构是否被破坏**（例如"带 patch 与不带 patch 的 preset 行**逐字节相同**"）。

**⇒ 正例与反例并列（★ R6 补，让这条纪律可照抄）**：
- **反例（不可作为判据）**：`--dump-config` 的字符串出现／不出现。R5 **两个方向都误判过**——**假阳性**：patch 原文出现在 dump 里 ⇒ 被当成"已合并进内层行"；**假阴性**：合并发生在**注册期**，dump **照不出来** ⇒ 被当成"机制不工作"。
- **正例（可作为判据）**：**驱动真入口/真装配，读它交给下游的那份东西**。两个已进仓的样板：① `tests/audit-preset-overlay-merge.test.mjs`（捕获 `agentPresets.register` 收到的**定义**，断言内层行合并、原字段保留、无 overlay 残留、未匹配仅具名告警）；② `tests/audit-declaration-publishes-face.test.mjs`（**声明 ⇒ 面真的发布**：驱动真入口 `apply(ctx, config)`，读 `ctx.tools.register` 收到的**工具清单**；无声明 ⇒ 恰 1 个工具；点号与嵌套两形态**等价**；坏形状键**具名告警且不发布**）＋ `tests/audit-declaration-publishes-face.mutants.mjs`（**证明它可红**：关掉点号通道／**关掉嵌套展平**／静音告警 ⇒ 各自打红它点名的那一项）。
- **真机侧的对应判据**：**`request/header` 事件里的 `tools` 数组**（宿主真正发给模型的载荷），比模型自述硬；`tool/result` 回执里的 `settingsMerge`／`settingsKeys`／`settingsUnparsed` 可交叉核对"声明是否到了入口"。

**⇒ 第四条硬要求（★ R7 新增，源于 F53 从"只有文档规则"到"有门禁"）**：**新门禁必须证明自己有牙**——不能只写"某某必须如此"，要**当场种一个违规再证明它变红**，删掉再证明它变绿。范式（`tests/audit-fs-purpose.test.mjs`）：① 规则**窄而准**（真实 `node:fs` 导入**且**在语句位置，注释/数据字符串里的同名字符串**不算**）；② **不是"存在即通过"**——断言**导入者集合 == 已登记集合 ∪ 带合规注释者**（**集合相等**，还查"登记过期"）；③ **自探针**覆盖误报族（注释里/数据字符串里的 `node:fs` 不算导入；裸导入读不出用途）；④ **种违规证明**：往包内临时种一个**裸导入**文件 ⇒ 门禁 **EXIT=1**（两条断言同时点红），删除 ⇒ **EXIT=0**。⇒ 判据升级：**"有规则"不算覆盖，"能拒绝一个真实违规"才算。**

**⇒ 第五条硬要求（★ R8 新增，源于一次**假阴性**）**：**证据源必须与事实所在处一致** —— 断言要在**事实真正落地的那个通道**上读。实例：vmu-assistant 的首跑报 13 passed/3 failed，**三红是假的**——那三条实质断言读的是**驱动 stdout**，而**工具回执只落在会话日志里**（驱动不回声结果）；改为读 `sess.rawResults`／`sess.assistant` 并新增 **`--session <id>` 离线复评**（同一套断言复评**已录会话**、**不花会话**）⇒ **15/0**。★ 与第三条（`--dump-config` 不是运行时定义）同族：**判据与环境错配会产生假阳性或假阴性两个方向的错误**。⇒ 纪律：写断言前先问"**这个事实到底写在哪儿**"；长回执/大对象优先走**离线复评**，而不是把判据压在摘要输出上。

**⇒ 第五条补：把"生效"拆成【三级链】（可达 ≠ 被构造 ≠ 被调用）**（★ R16 新增，源于 B 组复核的两个实例）—— 本条原话说"证据源要与事实所在处一致"，但真正被反复误判的是**"哪一级"算事实**。三级必须分开取证，**缺一级就降一档**：
1. **可达（reachable）**：代码里存在引用点（`file:line`）—— 只说明"有一条路通到它"，**是一条声明，不是一件已发生的事**。
2. **被构造（constructed）**：运行时对象里**真的存在** —— `Object.keys(createKernel({...}))` 的成员、包 `packTools()` 的产物、或真机 `request/header.tools` 里的面。
3. **被调用（called）**：真实轨迹里**出现过它产出的那个事实** —— 会话日志／工具回执／测试断言里的那条读数。
⇒ 规则：判"**具备**"必须**三级全中**，结论里**逐级给证据**；只有①或①② ⇒ 判**部分**或**缺失**，**不得**写"已实现"。★ "可达"最容易冒充"生效"，因为它只要一次 grep；而"被调用"要在真实轨迹里出现，最容易被"提示语/注释/文档说它生效"替代 —— 那正是本条（证据源）要防的假阴性。
- 实例 1（B2 公共蓝图）：`vmu.turn.protocolPath` 在 `settings/schema.js:212` 与 `packs/v5r/settings/defaults.json:12` 都有声明（①可达），但全库**零消费者** ⇒ ②③从未发生 ⇒ **缺失**（"声明了一个旋钮，没人拧"）。
- 实例 2（B11 自反馈库）：成员侧 `vibe_v5_feedback`（`packs/v5r/tools.js:404-438`）三级全中 ⇒ **具备**；院士"阶段自反馈"连**阶段词表**都没有（`packs/v5r` 全目录 `复盘|阶段自|流程优化|组织协作` 零命中）⇒ **缺失**；且提示行 `packs/v5r/prompts/v5r-blocks-b.js:105` 承诺"未闭环条目会出现在汇报与总览的计数里"，而 `tools.js:174-189`（report）与 `:195-210`（overview）**都没有** feedback 计数 ⇒ **③被调用这一级上提示语与代码不一致**（这是缺陷，不是"未来工作"）。
- 与第四／六条的分工：第四条问"**门能不能咬人**"，第六条问"**观测量在两端是否真的不同**"，本条问"**你判它生效，用的是哪一级的证据**"。

**⇒ 第五条附：共享文件的编辑纪律（★ R17 补，源于一次把 `package.json` 写坏的事故）** —— 第五条讲"**去哪读**"，这一条讲"**用什么写**"：读错会报错结论，写错会毁掉共享文件。四条都来自实测，不是泛泛的"注意编码"。

1. **事故（可核对，R16）**：PowerShell 链 `Get-Content -Raw` → `-replace` 插登记行 → `Set-Content`／`WriteAllText` 写回，在 **GBK 控制台**下把 UTF-8 中文写坏：字节数 **76,118 → 40,342**，随后 `JSON.parse` 抛 **`Bad control character`**，整个 `package.json` 不可读。**恢复方式只有两条**：`git checkout -- package.json` ＋ **用 Node 重放 ASCII 登记行**——不是"再修一遍编码"（坏掉的中文没有原字节可救）。
2. **写盘通道一律走 Node**：lane 写任何共享文件（`package.json`／`installer.js`／`docs/**`／`settings/*.json`）一律 `readFileSync(path,"utf8")` → 字符串替换 → `writeFileSync(path, out, "utf8")`。**禁止**用 PowerShell 读改写（`Get-Content`／`-replace`／`Set-Content`／`WriteAllText`）——它在非 UTF-8 控制台下会**静默降级**，而且 `node:fs` 直写不经过 harness 的 fs 版本守卫（与 `第九条·I9` 同族：守卫看不见的写入者，会把定点编辑悄悄毁掉）。
3. **改共享 JSON/Markdown 前先确认无并发写者**：`git status --porcelain -- <file>`（必要时连 `git diff --stat -- <file>` 一起读）确认没有别的车道正在写同一文件；有就在回执里点名等待，不抢写。**"读-改-写"三步之间若有别人落盘，你的替换会覆盖对方的改动，而且不会报错**——这是本轮唯一一个"两个人都在正确做事、结果还是坏的"失败形态。
4. **写前确认目标段落不是生成区**：本仓在 HTML 注释里用 `BEGIN GENERATED: <生成区名>` … `END GENERATED: <生成区名>` 界定生成区（本卷的零机制矩阵块就是生成区），两者之间的内容由生成器拥有，手写的行落在里面，下一次 `--write`／`--check` 会把它**逐字符还原**（§11.af 与 `第九条·I9` 的同一根因）。⇒ **动手前先 `Select-String` 一遍生成标记**，再决定插在哪。

⇒ 与第五条的合读：**读**要在事实落地的通道上（本条原话），**写**要在不会破坏事实的通道上（本条附）；两者都要求同一件事——**先确认你碰的这个文件此刻归谁**。

**⇒ 第六条硬要求（★ R9 新增，源于 `vmu-entry` E-17(乙)）**：**断言所选的"观测量"必须在被测的两档之间【真的不同】** —— 否则它是**语义级的空过**，而**语法级的 RULE E 看不见**（RULE E 只问"某个集合是否可能为空"，不问"这个量在两档之间是否有差异"）。实例（本轮实测）：那条断言说的是"`config.packs` 的顺序决定重叠设置 ⇒ 后应用者胜"，观测量却取了 **`vmu.meetings.quorumRule`**；而**两个包现在都声明 `'m-unanimous'`** ⇒ `reversed.quorum === on.quorum`，`!==` **永不成立**。★ **双重教训**：它当年"能区分"**只因为 v3-core 声明的是域外值 `'majority'`**，而那个域外值正是本轮**值域门禁**抓到的真实缺陷（域＝`['m-unanimous','all-unanimous']`，且 `ballot.js` 的默认 tally 只把它当标签）⇒ **不准为救一条断言把非法值写回去**。**正例**：观测 `vmu.meetings.verdictMaxRounds`（v3-core **5** / institute-min **3**，顺序可见）⇒ `vmu-entry` 回 **150/0**。⇒ 纪律：**先证明"这个量真的随被测条件变化"**（把两档实测值对一下）再写进断言；"同值也能过"属**语义空过**，与 RULE E 拦的**语法空过**是两回事、要分别防。

**⇒ 第七条硬要求（★ R10 新增，源于 `audit-dependency-cycles`）**：**门禁必须读"事实所在的那种文本"** —— 静态门扫源码时，**注释与数据字符串不是代码**。实例：依赖环门禁原先直接对**原文**跑 `(?:import|export)[^'"\n]*from '…'`，于是 `resume.js` **注释里**为解释一个摘要助手而写的一句 `import { contentDigest } from './resume.js'` 被当成真 import ⇒ 报出**自环**；当时的修法是**改写注释**——**门禁在指挥文档措辞**，这是判据与环境错配的又一方向。**正解**（与 `audit-package-membership` 同一做法）：**先去注释**（`tests/_lib/strip-comments.mjs`）**再要求语句位置**（`^[ \t]*(?:import|export)\b[^;]*?from '…'` ＋ 副作用导入），并配**自探针**：注释（行/块）与数据字符串里的 import 形状**不得**被计入，而**四种真拼法**（单行、**多行**、副作用、re-export）**必须**仍被找到。★ **附带收获**：换成语句位置判据后，同一棵树上的内部边由 **245 → 246** —— 旧模式连**多行 import** 都看不见（`[^'"\n]*` 不跨行），所以这次既**去掉假边**又**补回一条真边**。⇒ 纪律：静态门的输入要先"降到代码"，再用**双向自探针**证明"假的不算、真的不漏"；只证一头会留下另一头的错。

**⇒ 第八条硬要求（★ R11 新增，**用两次血换来的**：R10 的 `contentvalue.js` 漏搜 ＋ R11 的 `seedKeys` 截断误判）**：**"我没找到／我只读到 N 个" 不是"它不存在"** —— **负证据（absence claim）必须先说清搜索范围与观察完整性**，否则报出去的就是错的。两个实例（都发生在我身上，因此按实测记）：① 我用 `-Filter 'resume*'` **按文件名前缀**找 `resume.js` 的拆分，漏掉了名字里没有 `resume` 的 **`contentvalue.js`**，却写成"**第三块未找到**"；② 我用 `Select-String` 的**截断输出**读一份 10 项清单，读到 9 项就断言"**缺 `human`**"，实际清单是 10 项——**我把"我读到的"当成了"文件里写的"**。⇒ 纪律（三条，缺一不可）：**(a) 断言"不存在"之前，换成按语义关键词全仓搜**（不用名字前缀）；**(b) 任何"只有 N 个／没有 X"的读数，必须来自完整读取**（读全文或整段，不用摘要/截断输出）；**(c) 报告里把"我搜了什么、范围多大"与结论一起写**，让读者能判断这条负证据的有效性。★ 它与第五条（证据源必须与事实所在处一致）**互补但不同**：第五条管"**去哪儿读**"，本条管"**读全了没有**"——**假阴性的两个来源**。

**⇒ 第九条硬要求（★ R12 新增；由 vmu-assistant 提出、我按本轮实例判定它够格）**：**每一个"跳过／豁免／not-run"分支，都必须有一个相反的开关或自探针能把它变成红** —— 否则**豁免越多、门越假绿**（门在"主路径"上有牙**不等于**没被自己的逃生口掏空）。★ **与第四条的分工**：第四条说"**门要能咬人**"（种违规⇒红），本条说"**门的每个逃生口本身要可审**"（跳过必须能被反证为红）。**本条是这一整轮最反复的失败形态**，实测实例（都是本轮/近两轮踩到的）：① `generate-zero-mechanism-matrix.mjs` 的 `judge()` 把"探针抛出"**排在**"无裁定行⇒红"**之前** ⇒ **"无裁定行＋探针抛出"两个计数器都不进**，R10/R11 拆出的两个模块悬了两轮，**修正顺序后当场抓出第三个 `resumeflush`**（§9.20）；② 同门的 `EXPECT_NA`／`EXPECT_UNDECIDED` 是**显式记账**的跳过 ⇒ 必须有"漏了 vs 未定"的区分（已有）；③ `vmu-assistant` 的 `--require-host`：把 **`not-run` 直接变红**，否则"5 条 not-run"永远看着像绿的（**其自证**）；④ 我自己的普查门：`notAttached` 可能整类**缺席而不报** ⇒ 因此加了"**种一个不存在的面 ⇒ 必须被归档并具名**"的自探针；⑤ 更早的 `fired ⊆ enforced` 空过：分支**从未被触发**＝一种隐性跳过，修法是把"**真的 fire 了**"做成字段。⇒ 纪律：**写门时先把所有 `continue`／豁免表／`EXPECT_*`／not-run 列出来，逐条问"它变红要什么条件"**；能加**反向开关**（如 `--require-host`、`--strict`）就加，不能加就配**自探针**。★ **自探针的排序**（vmu-assistant 建议、我采纳）：**先证既有豁免没被误伤，再证新豁免生效** —— 落"调用形豁免"时，先证**家族形/命名空间仍不报**，再证**调用形不报、裸键仍报** ⇒ **豁免之间会互相掩护**（本轮已在"两个计数器各自为 0"上吃过一次）。

**⇒ ★ R15 补记（task-114）：第九条**实例台账**（编号形如 `第九条·I1`，可引用；每条写明**哪一次运行**测到）** ✓ —— 只收录**实测**到的形态，不收录"应该会怎样"。★ **本台账的运行标签刻意用 `O1`… 形状**：第一版用**另一个"字母＋数字"编号**当运行标签，被 `tests/audit-claim-traceability.test.mjs` 的 claim-id 正则（`\b([CDFG]\d{1,2}[a-z]?)\b`）读成**引用** ⇒ 当场报出一条**悬挂引用**（实测；已改）—— **"写文档"这个动作本身会与被扫的判据相撞**：这是 **⑧ 的第二型**（⑧ 第一型＝写进卷里的**发现的名字**污染被扫计数；**第二型＝连"运行编号"都会被反向读成引用**；两型合起来＝**你写下的每一个 token 都可能在门的另一侧有语义**），与 `第九条·I7` 同族 ✓ —— ★ ⑧ 的正文与修法见本节 ⑧ 那一条，**本处只作指针，不在两处各写一份**：
- **`第九条·I1`｜矩阵 `judge()` 的判序跳过**（跳过排在判红**之前** ⇒ "无裁定行＋探针抛出"两个计数器都不进）：变红条件＝把"未登记 ⇒ 红"排在"探针抛出就 `continue`"**之前**，并**点名**。观测（R15 运行 O6）`node scripts/generate-zero-mechanism-matrix.mjs --selftest` ⇒ `selftest ② audit 未登记 ⇒ unregistered=1 mismatches=1（期望 unregistered 恰 +1；且必须红）`、`selftest ⑤ 未登记模块 fixture ⇒ mismatches=2（点名 fixture=true）`，EXIT=0。★ R12 修序后**当场抓出第三个** `resumeflush`（§9.20）。
- **`第九条·I2`｜`EXPECT_NA`／`EXPECT_UNDECIDED` 的记账型跳过**：变红条件＝"漏了"**必红**、"未定"只计数，两者不得互相吞并；**期望词表是闭集**。观测（R15 运行 O7）`node scripts/generate-zero-mechanism-matrix.mjs --check` ⇒ `96 modules, 0 mismatches, 0 unregistered, 0 EXPECT_UNDECIDED, 9 probe-errors, 4 n/a`（**四个数分开印**），EXIT=0；同脚本 `--selftest`（O6）另有 `selftest ③ audit=EXPECT_UNDECIDED ⇒ undecided=1 mismatches=0` 与 `selftest ① 期望写错 ⇒ mismatches=1`。
- **`第九条·I3`｜`--require-host` 把 `not-run` 变红**：变红条件＝未跑的直接红＋退出码非 0。观测：R15 运行 O1 `node tests/vmu-assistant-host-slice.test.mjs` ⇒ `6 passed, 0 failed, 5 not-run` **EXIT=0**；R15 运行 O2 同命令加 `--require-host` ⇒ `6 passed, 1 failed, 5 not-run (--require-host)` **EXIT=1** ⇒ 那 5 条"未跑"不是悄悄通过。
- **`第九条·I4`｜普查门的 `notAttached` 整类会不会缺席**：变红条件＝**种一个不存在的面**，必须被归档并**具名**。观测（R15 运行 O3）`node scripts/audit-projection-census.mjs` ⇒ `PROJECTION CENSUS: 10 passed, 0 failed` EXIT=0，其中两条具名断言绿（`a planted non-existent face is FILED …`／`and it is notAttached BY NAME`），活读数 `declared=10 attached=7 viaAlias=0 notAttached=3`。
- **`第九条·I5`｜`fired ⊆ enforced` 的条件式跳过**（`if (Array.isArray(r.fired))` ⇒ 字段一缺席，子集检查**永不运行**）：变红条件＝把"真的 fire 了"做成**必填字段**，并以**无条件**形式断言子集。观测（R15 运行 O8）`node tests/vmu-conference.test.mjs` ⇒ `72 passed, 0 failed` EXIT=0：其 `:246`（前置 `receipts.length >= 2` 在 `:244`）与 `:280`（14 条触发场景**逐条**查 `Array.isArray(e.fired)` 与 `fired⊄enforced`）都是**无条件**形式 ⇒ 今天回执必带 `fired[]`。★ **残留（具名，未修）**：`tests/vmu-bidding-audit.test.mjs:88`／`tests/vmu-board-audit.test.mjs:105`／`tests/vmu-ballotbox.test.mjs:234` 仍是**条件式** ⇒ 在那三处"字段缺席"与"子集成立"不可分（**今天冗余，但冗余仍是逃生口**）。另一侧读数（R15 运行 O5）`node tests/audit-enforced-consistency.test.mjs` ⇒ `358 passed, 0 failed` EXIT=0，5 条造错自证具名红（重复键／静态清单＋错归属／`enforced: null`／拒绝缺 `enforced`／非确定性对）⇒ "分支真的被触发"这件事有读数。
- **`第九条·I6`｜★ 取得↔释放门的 `不涉及` **假裁定**（R14，作者是我）**：变红条件＝① **每一行**裁定都校验（新增 `STALE-ROW`：行指向的文件不在扫描集合 ⇒ 红）；② `不涉及` 收紧成"无取得位点 **且** 无锁库"，发锁的文件再写 ⇒ `FALSE-不涉及`；③ 新增闭集**第五词** `自持-取释面`，其**长出定时器／监听器** ⇒ `OWES-FINALLY`（＝"条件出现即红"）。观测（R15 运行 O9）`node scripts/audit-acquire-release.mjs --selftest` ⇒ `16 passed, 0 failed` EXIT=0，含 `§0c refused/accepted directions: {"refused":5,"accepted":2}` 与 `§0d counts: {"planted":9,"honestListsEmpty":true}`；正常跑 ⇒ `25 passed, 0 failed` EXIT=0。★★ **它与 I1–I5 不同型**：根因**不是**"分支没被触发"，而是**词表缺形状** —— 取得词表**刻意跳过"定义"**（`const acquire = (a) =>` 不是调用，这条跳过本身正确且有双向自证），而 `kernel/storepolicy.js` 恰是全内核**唯一**的取锁面（实测 `acquire()` 后 `status().locks === 1`、二次取锁具名拒 `VMU_CONFLICT`）⇒ **"跳过本身正确"也能造出假绿**，这是本台账新增的一型 ✓。
- **`第九条·I7`｜G2 的**台账**与**样本**（R14，vmu-verify2）**：变红条件＝① 豁免**台账**陈旧（修好一条却不删它那一行）⇒ 红；② **合成样本**被写进被扫的卷 ⇒ `group G` 报"未登记" ⇒ 红。观测（R15 运行 O4）`node tests/audit-vmu-docs.test.mjs` ⇒ `95 passed, 0 failed` EXIT=0（**G2 台账仍显形 3**）。R14 的两次现场红：中间版本合成集写错 ⇒ 该门红 **80 秒**（`08:54:13–08:55:35`；**该窗口内的任何 T0/T1 读数作废**，按"扫描期间不得改动作业集合"）；`docs/22` 把三个服务名写成**裸形** ⇒ G2 **静默**（真值 3→0）⇒ 改回**调用形**后恢复。
- **`第九条·I8`｜取得↔释放门自己的 `--selftest` not-run 分支 ＋ `slice(0,3)` 空过（R14，作者是我）**：变红条件＝① 把 §2/§3/§5 抽成**纯函数**，用**同一个**函数种违规（另加诚实夹具**五表必须全空**）；② 给该跳过加**相反开关**；③ 正向方向必须 `=== null`。观测（R15 运行 O9）：`§0d counts: {"planted":9,"honestListsEmpty":true,"lists":["unregistered","rulingProblems","fileLevel","callLevel","tripwire"]}`；`node scripts/audit-acquire-release.mjs --selftest --require-tree` ⇒ `25 passed, 0 failed` EXIT=0（开关压过跳过）。★ R15 顺手把 RULE A 注释里那些**数目**改成**打印读数＋断言**（5 词／7 拒／4 受；5 拒／2 受；9 种植）⇒ "注释声明与实现一致"这件事本身现在有牙 ✓。

**⇒ ★ R17 补记（task-118 的三条形态；由该面负责人实测，**本轮由 `vmu-assistant2` 转记并读码定位**——★ 凡我未复跑者，逐条写明，不写成"已验证"）** ✓：
- **`第九条·I9`｜★ 生成器覆盖自己的定点编辑（R17）**：**形态**＝**块内键每次被重新 `emit`** ⇒ 人手写进生成块的值域（例如把 `type` 从 `string` 改成 `enum`，或反过来）会在下一次 `--write/--check` 被**逐字符还原**成生成器推导的形态，而**fs 版本守卫看不见**（生成器经 `node:fs` 直写，不走 harness 的版本守卫）。**变红条件**＝`scripts/generate-wired-schema.mjs` 的两条不变量必须**同时**有牙：`:458`（同一个键**既在生成块内、又在手写 schema** ⇒ 红）与 `:464`（键**手写声明了值域**却**不在手写 schema** ⇒ 红——其 message 逐字写着 *"the generator would emit `type:'string'` and destroy t…"*）；缺任一条，"手工声明值域"就会被静默摧毁。**观测**：**R17 该面负责人实测**；我本轮**读码定位**了通路（`:47` `SCHEMA`＝`settings/schema.js`、`:330-364` `collect()`、`:444-483` 不变量段）⇒ **我本轮未复跑该实验**。
- **`第九条·I10`｜★ 门禁记账**漏桶**（联合门看不见"手工声明值域"的键）（R17）**：**形态**＝生成器里**新分支在 `already` 检查**之前** `continue`** ⇒ 该键**不进 `preexisting` 桶**；而联合门 `tests/audit-vmu-wired-union.test.mjs:38` 的判据恰是 `seen.has(k) || preexisting.has(k) || skipped.has(k)` ⇒ **两桶都不含它**，于是它在"联合"这一侧**不可见**（假绿），或反过来按文件报违规。生成器注释自己就写着这个形状（`:352`：*"a module's reads against exactly two sets (the keys emitted for THAT module, and `preexisting`), so a `continue` …"*）。**变红条件／修法（Lead 裁决口径）**＝**"手工声明值域的键**按构造就是 pre-existing**" ⇒ **两桶都记**；现落为 `:355` `if (HAND_DECLARED_DOMAINS.has(key)) { handDeclared.push(key); preexisting.push(key); continue }`（`handDeclared` **与** `preexisting` 同时入桶后才 `continue`）。**观测**：**R17 该面负责人实测**；我本轮读码核实 `:352`／`:355`／`:364`（`return { defs, perModule, skipped, preexisting, handDeclared }`）与联合门 `:38` ⇒ **我本轮未复跑**。
- **`第九条·I11`｜★ 多行盲点"先分类再打红"（R17 · task-118 ②，所属 `vmu-verify2`）**：**形态**＝shape-C（条件式断言）的**多行孪生形**：只按单行看 ⇒ 把条件与断言拆到多行的**整类**看不见（假绿）。**变红条件**＝① **先分类再打红**：`MULTILINE_C_BASELINE_FINGERPRINTS` **每文件一条**；② `diffFingerprints` 的**纯增与纯删都红**（同一份清单必须同步）；③ **自探针**（Lead 口径 6 条）；★ ④ **不加计数天花板**（**Lead 裁决**：天花板会把"又长出来一处"变成静默绿）。**观测（本题由我实测部分）**：`node -e` 读 `tests/audit-declaration-criterion.test.mjs` ⇒ `MULTILINE_C_BASELINE_FINGERPRINTS entries=57 distinctFiles=57`（**与 Lead 的"57 条每文件基线"逐数吻合**）；同段的**代码自述**读数为 `:302-303` *"MEASURED, this shape occurs 199 times on this tree and 125 of those are unexcused - one entry per file"*；纯增纯删两条方向见 `:320-321` 的 `diffFingerprints` 注释、`:790`（*"pure ADDITIONS are red even when the total count is unchanged"*）、`:397-402` 与 `fixture J②`（`:950`）。★ **别与另一本账混**：`A_CLASS_BASELINE_FINGERPRINTS` 是**另一本**（我实测本轮 `entries=67 / distinctFiles=52`，即 `RULE E` 那本，R14/R15 记的"67＝67"）⇒ **57（多行·每文件）与 67（RULE E）不是同一个数**。**观测**：本门的 `--selftest` **我本轮未复跑**（属 task-118 的读数）。

- **`第九条·I12`｜★ 一个生成器**把另一个生成器当子检查** ⇒ 性能问题被 `spawn` 放大（R33）**：**形态**＝`scripts/generate-wiring-index.mjs:124` **把 settings-table 的 `--check` 当自己的子检查去跑** ⇒ 单次变慢**被 spawn 放大两次**（放大的是"每次 spawn 的固定成本 ＋ 被调生成器自身耗时"）。**变红条件**＝该套件（`tests/vmu-wiring-index.test.mjs`）**整套耗时撞 180 s 界**即红。**观测（R33；依据 `_handoff/vmu/comms-round33-report.md:161-165`）**：单次 `node scripts/generate-vmu-settings-table.mjs --check` **14.04 s ⇒ 5.12–5.53 s**（目标 ~3–5 s，达到 ✓）；`node scripts/generate-wiring-index.mjs --check` **19.44 s ⇒ 6.37 s**（目标 ~6–8 s ✓）；整套 `tests/vmu-wiring-index.test.mjs` **Lead 量 `236.8 s`**（同一门在 `c7950ce` 时 **74.9 s**）⇒ **撞 180 s 界**（★ **整套数字归 Lead**；`vmu-comms2` **未重跑、也不冒充** —— 这条口径本身也是本条的纪律）。**根因（实测）**：`listIterationEvidence(key)` 第一版**每个键**都做一次 `f.text.split('\n')`（180 文件 × 1226 键）＋ 每个候选 `new RegExp` ⇒ 近似 **O(键 × 行)**。★ **处置（裁定）＝修负载，不修预算**：把实现**索引化**（单次回到 5–6 s）—— **不许为放行而抬 180 s 界** ✓。★ **一般化**：**当一个门把另一个生成器/门当子检查时，性能预算要按"放大倍数"读**，且**先量单次、再量整套**（本次正是"单次慢 4–5 s ⇒ 整套慢 160 s"）。

**⇒ ★ R15 具名裁定（task-114）：**零机制矩阵的视野不含门禁脚本 —— 这是边界，不是缺口** ✓：`scripts/generate-zero-mechanism-matrix.mjs` 的行**只**来自内核模块（`readdirSync(vibe-math-vmu/kernel)` 过滤 `*.js`），因此 `scripts/audit-*.mjs`／`tests/*.test.mjs` 这些**门禁本身**在矩阵里**没有裁定行** ✓。**为什么选"具名边界"而不是"加一类"**：加它就得给生成器引入**非内核注册表**，而"门禁脚本的零机制行为"**不是一个可探的行动面** —— 脚本没有 `create*` 工厂、没有 `status()`，它唯一的行为就是**退出码**，而那正是 RULE A 已经读的东西 ⇒ 硬加一行只会造出一个**测不出东西的行** ✗（本仓纪律：**不许为了让矩阵好看而造行**）。**谁守着守护者（三道，任一可复算）**：① **RULE A**（`tests/audit-declaration-criterion.test.mjs`：每个自证模式必须被**真跑**，`reallyRan` 与 `mentionedOnly` 两个字段把"提到"与"跑过"分开）；② **`package.json#files` ＋ `tests/audit-package-membership.mjs`**（新脚本漏登记 ⇒ 红）；③ **每门自己的 `--selftest`**（取得↔释放门的 `§0d` 用**同一个** `judgeTree()` 种 9 组违规 ⇒ 门自证会红）。★ 可复算判据：`node tests/audit-package-membership.mjs` ⇒ `13 passed, 0 failed` EXIT=0，且 `require('./package.json').files.includes('scripts/audit-acquire-release.mjs') === true`；`tests/audit-declaration-criterion.test.mjs` 打印的 `RULE A coverage` 里每项 `reallyRan:true`（`mentionedOnly:false`）。★ **这条裁定将来若被推翻**，推翻的判据是：那个脚本必须长出真正的可探行动面（有 `create*`／`status()` 形状），且矩阵的期望词表（**闭集**）里能写出它的零机制形状 —— 否则仍应留在边界外 ✓。

**⇒ ★ R14 补记：docs 键判据的【真来源】＝两条手写＋两条机械＋一条两阶段规则（全部实测，行号读的是 HEAD `4e5be5a`）**
`tests/audit-vmu-docs.test.mjs` 的"文档点名的 `vmu.*` 必须是已声明键"（group G）由**五件事**共同决定，**不是"三源"** —— 我上一轮报的"③ namespaces"是**死豁免**，本轮实测纠正：

| # | 来源 | 形态 | 实测 |
|---|---|---|---|
| ① | **`SETTING_DEFS`**（`settings/schema.js` ＝ core ＋ `PLANNED_DEFS`） | 手写＋生成物 | ★ **键数与接线数一律见生成器输出** —— ★ 权威值＝`node scripts/regen-all.mjs --check` 的 `settings table` 与 `readiness figure`。★ 本格原先手写 `1229 键（1108 已接线／121 未接线）`，**三个数全过期**，★ 且**违反本文件 `:671` 自己的规定**（"本节不手写这类计数"）⇒ 故改为**指针**。★ 判据口径见 `scripts/generate-vmu-settings-table.mjs` 的 `hasConsumer`／`carrierOf`（★ 含 `{{ setting:<key> }}` **模板读取**这一路消费者，★ 该路原先被漏判，已修） |
| ② | **`NON_SETTING`**（服务/注册名表） | **手写**，**现在唯一一份** | 35 名；`tests/audit-vmu-docs.test.mjs` 本轮改为**import** 它（两份拷贝**已经漂移**：审计说 `vmu.dissemination.impact(…)`／`vmu.dissemination.mediaRequest(…)`（**这两个已是真键**），生成器说 `vmu.outreach.*`（**R218 改名前的旧族名，什么都匹配不到**）） |
| ③ | **家族形** `vmu.x.y.*` | **机械**（看 match 后一字符） | — |
| ④ | **调用形** `vmu.<面>.<键>(` | **机械**（负向前瞻 `(?!\s*\()`，落于 `:348`／`:374`／`:399` 三处，另有"三处必须逐字相同"的漂移断言） | 设置项**永远不会被调用** ⇒ 不需要白名单 |
| ⑤ | **两阶段"有下位名即命名空间"** | 机械（第二阶段 `:384-391`） | 这才是真正在第 3 位生效的规则 |
| ✗ | ~~`namespaces`~~ | — | ★ **死豁免（实测）**：它的值**永远是两段**（`vmu.<面>`），而键正则**要求 ≥3 段** ⇒ 该 filter **永不成立**。自探针 ⑤b 现在**断言**这条，而不是把它当第三个来源 |

**★ 调用形豁免**≠**表可退休**（我本轮**先用它去做减负，被自己的量具否证**，按第八条记）：把 R108／R270 追加的 **10 个**名字从生成器表里退掉 ⇒ `scripts/generate-planned-settings.mjs --check` **STALE，123 键 vs 114**（会**新铸 9 个** planned 键：`vmu.ip.hold`／`ownership`／`contributors`／`recordSearch`／`transfer`／`vmu.collab.authorship`／`vmu.members.may`／`vmu.tasks.create`，证据行＝`docs/22` §接口形状表里那些 `<服务>.<方法>(…)` 调用形）。**根因**：**生成器的收集没有调用形规则**（`BROAD_RE` 无前瞻）—— 这条规则**早在 R269 就设计过而没落**（`docs/28:1361`「「后随 `(` 即调用」这条更通用的规则仍未加」）⇒ 调用形豁免**只**能止住"表**继续**长大"，**不能**让表缩小；**原子下一步**＝生成器加同一条规则**并重新生成 `settings/planned.js`**（会同时消掉 3 个幽灵键，见下）—— 属于"可以重新生成的人"，不在本轮验证侧。
★ **同一耦合当场又造出两个实例**（本轮并发文档改动）：服务 `vmu.tasks` 的 `status()`（`docs/29` 把"为绕门拆写"的调用**复原**为调用形）与 `docs/22` 的服务方法 `bindBox()` ⇒ `--check` **STALE 116/114**、`vmu-planned-settings` **RED**。**这不是谁写错了文档，而是生成器少了同一条规则**：调用形豁免落地后，**两处判据必须同改**（§9.8 ⑭ 的原话）。

**★ 本轮由此抓到一类真缺陷："planned 键只靠【调用形】提及而立"**（新门 G2，`tests/audit-vmu-docs.test.mjs`）：来源卷里**每一次**提及都带 `(` ⇒ 该名字是**服务面**，却被登记成设置（行上是 `planned:true, def:null`，即"设置表承诺一个不存在的旋钮"）。**实测恰好 3 个**：`vmu.dissemination.impact(…)`、`vmu.dissemination.mediaRequest(…)`（`docs/22` 调用形）＋ `vmu.meetings.open(…)`（`docs/10`／`27` 调用形）。★ **本门自己的文档也算来源卷**：我把这三名**裸写**在本节里时，G2 **当场静默**（裸形让它们看起来像键声明）——这正是第七条的现场：**门读的那份文本就是事实所在处，写结论时也必须按门要的形状写**。**它们与生成器那两处漂移是同一件事的两半**。门以**具名台账**形式落：第四个别名 ⇒ 红；修好一个 ⇒ 必须**删掉它那一行**（否则红 ⇒ 台账不会陈旧）。谓词另配**合成自探针**（只调用形 ⇒ 抓到／键形 ⇒ 静默）。

**⇒ 第九条的第 N 个实例（本轮现场）**：那"四条自探针"里的 **②** 原本**为错误的理由通过** —— 它拿一个**恰好是真键**的名字当"命名空间"样本（`keys.has` 先豁免）⇒ 它**从没碰到自己名字所指的那条规则**；本轮把探针改成**跑真正的两阶段判据**（`bogusOf`），② 改用**非键的父子样本**（父被"有下位名"豁免、**子仍被报**）；③／④ 的样本也从服务 `vmu.tasks` 的 `status(…)`（**真的会变成 planned 键**，会把探针悄悄变成"第二条第①类豁免"）换成**合成名**。★ **合成样本一律留在测试文件里，不写进任何卷**：本门扫的卷就是本门自己的输入，把 `vmu.probe.*` 这类样本明文写进本节，会让**判据扫到自己的样本**（本轮当场发生：group G 报 `vmu.probe.*` 未登记）——**"门读的那份文本"包含写结论的那份文本**（第五条＋第七条）。另加 **⑤**：手写表自身**必须能变红** —— (a) **任何 `NON_SETTING` 条目是真键 ⇒ 红**（正是它抓住审计那份拷贝里那两个过期条目的方式）；(b) `namespaces` 恒为两段 ⇒ 断言。**全部改动零成本换绿**：`audit-vmu-docs` **95 passed / 0 failed**；RULE E 指纹集 **67＝67 未动**。

**⇒ ★ R15 新增两条硬实例（都是"门的判据自己"造成的，都实测并已修）**
**⑦ 合成探针样本必须与被扫集合【物理隔离】**：G2 的**样本名**一旦写进 `docs/11` 本节（本门扫的卷之一），`group G` 立刻把它们当**未登记的真实名字**报出来 ⇒ 门变 **94 passed / 1 failed**。⇒ 纪律：**合成样本只留在测试文件里**（或用一个文档里不可能出现的保留前缀）；"探针样本"与"被扫数据"共处一个命名空间时，**探针的自证与门的结果不再独立**。
**⑧ 门把自己的发现【裸写】进被扫卷，会把发现本身擦掉**：把 G2 台账里的三个名字**裸形**写进本节 ⇒ 它们在来源卷里各多一次 bare 计数 ⇒ **G2 当场静默（真值 3 → 0）**。修法：结论里凡"服务方法"一律写**调用形**（`vmu.x.y(…)`）或**服务限定短写**（"服务 `vmu.x` 的 `y()`"）⇒ G2 恢复显形。★ 该坑本轮**三人各踩一次**（我两处、`vmu-assistant2` 一处自陈），说明它**极易被"写文档"这个动作本身触发** ⇒ 纪律：**每次改完正文卷，立刻重跑该门**。
⇒ 两条合起来是第九条的新形态：第五条问"**去哪儿读**"，第七条问"**读的是代码还是散文**"，本条问"**你写结论的那份文本，是不是门要读的输入**"。

**⇒ ★ R15 状态更新（G2 台账已清空、生成器已补规则）**：R14 判定的"原子下一步"**已落地** —— `scripts/generate-planned-settings.mjs:221` 现在带 `后随 ( 即调用` 的跳过（＋`:189` 的 `serviceCall` 桶），因此 **planned 114 → 111**（三个"幽灵键"——两处 dissemination 服务方法＋meetings 的 open——不再被登记）。★ **本节因此改写成服务限定短写：把这三个名字裸写回正文，会让 `group G` 当场报"未登记"**（我本轮就是这样把门弄红的，见上面第 ⑧ 条；`vmu-comms2` 与 `vmu-pack2` 也各自独立抓到同一条），`--check` ⇒ **`up to date (111 planned keys)`**，`vmu-planned-settings` ⇒ **ALL GREEN (planned=111, 39/0)**。G2 的具名台账随之**清空**（`KNOWN_CALL_ONLY = []`，注释写明 **REPAIRED, not merely pardoned**）—— 这正是台账语义：**修好一个就删掉它那一行**。

**⇒ ★ R21 新增硬要求：「引用前先落一行核验」的加强版 —— 报告任何真机读数之前，先证明【跑的是哪个字节】**
**事实（实测，哈希级）**：R17–R21 期间某些真机会话的宿主，加载的是 `D:\_tmp\r17-home\profiles\ext\node_modules\dsh-vibe-math\vibe-math-vmu\` 下的**一份快照** —— entry `vibe-math-vmu.js` sha256[0:16] ＝ **`13DA3E536C9187BF`（mtime 2026-10-15 00:29:09 +0800）**，而**同刻仓库**是 **`EA836778F2197B12`（mtime 17:13:49 +0800）**。**机制**：R17 用 `Copy-Item -Recurse` 从 `ext-home` 建 scratch home，而那一层是 **SymbolicLink → 仓库** ⇒ **`Copy-Item` 把链接解引用成了一份快照**（默认行为、不可见）。**Delta（相对当时的仓库）**：**10 个文件不同**（`host.js`／`kernel/index.js`／`kernel/lean.js`／`kernel/mathjobs.js`／`kernel/meetingmarker.js`／`kernel/meetings.js`／`kernel/pack.js`／`packs/v5r/prompts/v5r-core.js`／`settings/schema.js`／`vibe-math-vmu.js`）＋ **1 个文件只在仓库**（`packs/v5r/middleware/artifact-counter.js`）。⇒ **该快照里没有 R17 之后的任何修复**（ordermode 的读取侧、`artifact-counter`、`kernel.rules.validate` 的 plan 侧、H2 守卫都不在）。
**⇒ 两条纪律**
1. **报告真机读数前，必须证明"宿主实际加载的 payload 哈希 ＝ 仓库哈希"**，并核**关键新文件在场**（缺一即该读数**不得**标注为"当前树"）。★ 推论：**"我改了代码 ⇒ 我的实验测到了它"是一个需要证明的假设，不是默认**。
2. **凡依赖 payload 落地时间之后才有的修复/模块的结论，只能标注"对那份快照成立"** —— 既**不许**一刀切作废，也**不许**一刀切保留（**按 payload 分档**）。
★ 本条与既有三条同族（**量具坏了会给出自信的错误答案**／**"读会话日志"本身是有版本的读法**（多帧解码）／**`JSON.stringify(<Promise>)＝"{}"`**）⇒ 它们合并成一节 **「测量环境的同一性」**（payload 哈希／解码帧完整性／`await` 指纹），在矩阵 v16 里成节。

---

**清单（当前，2026-10-09 第 18 轮）**

| 守卫面 | 语义 | 生产是否调用 | 理由／生产调用点 |
|---|---|---|---|
| `requireStore()` | 返回 durable store，缺失则具名拒 `VMU_ENGINE_UNAVAILABLE` | **是** ✓ | loader 的 kernel 门面 `services.kernel.read()`（`kernel/index.js`）：原先 `store ? store.read() : null` 会**静默返回 null**（正是"store 绝不静默假造"要拒的形状）⇒ 现走同一 `mustStore()` |
| `requireLibrary()` | 返回磁盘 library，缺失则具名拒 | **是** ✓ | `declareTracks()`：原先内联一份"no library root"拒（同一契约的**第二份拷贝**）⇒ 现走同一 `mustLibrary()` |
| `requireMembers()` | 返回 roster，缺失则具名拒 | **否**（**诊断／硬契约面**） | 今天**没有生产路径需要硬契约**：消费者读**可空**的 `kernel.members` 属性并各自具名拒（D5：内核不自带角色；`declareSlots()` 是**创建** roster 的一方）。该面为"调用方不得拿到 null"的硬契约而存在，登记在此以免被误当生产护栏 ✓ |
| `settingsView()` | 返回**只读**实时设置视图（属性读＋`get(k)`） | **否**（**诊断 API**） | 生产消费者在**构造期按注入**拿到视图（30+ 服务 `settings: settingsView`）⇒ 模块图不需要访问器；访问器本身是诊断／内省面（只读写穿陷阱也经它测试）。登记同上 ✓ |

**"允许无 store／无 roster 也能跑"的地方（明写，**不得**用守卫）** ✗：`status()` 的 `store`／`members`／`library` 字段（缺席要如实报 `null`，`status()` 抛异常就不是观测了）、`registry.register('vmu.members', …)` 的条件发布（"只有真实能力才出现"）。

---

## 5. 复用本仓既有基础设施（**已按 B′ 实测校准**）

### 5.1 计数口径（**先分清两套，别混** ✗✓；**2026-10-09 重算 ✓**）

| 口径 | 来源 | 实测值（**本轮重新实测** ✓） |
|---|---|---|
| `derived.*`＝**作业计数**（**2026-10-14 实跑** ✓；PHASE 6 复测 ✓） | `node tests/run-tests.mjs --counts`（或 `node scripts/update-doc-counts.mjs --check`） | **`total 454 / suites 348 / probes 106`** ✓（旧值 134／68／66、322／250／72 均已在扩卷与增件后过期 ✗；PHASE 6 删除 `audit-gate-snapshot.test.mjs` 后作业数 −1） |
| `shipped.*`＝**文件计数** | `package.json#files` 里 `tests/*.mjs` 的行数 | **`total 393 / suites 288 / probes 105`** ✓ |
| `vmu 子集`＝**作业计数**（**2026-10-14 新增机器面** ✓；**PHASE 6 起由 `--scope-report` 派生、`update-doc-counts --write` 自动重写** ✓） | `node tests/run-tests.mjs --scope-report`（只派生、不跑作业） | **`total 385 / suites 323 / probes 62`** ✓（`--counts` **按设计**仍报仓库计数 ✗✓，见下） |

**322 的推导链（逐行可核 ✓，2026-10-14 复算）**：`deriveJobs()` 是唯一来源 ⇒ **只扫 `tests/` 顶层不递归**（纪律 11 ✓）⇒ 排除 3 类（runner 自身／`NEEDS_ARGS`／`replaceBare` 的裸作业 ✓）⇒ 裸作业 ＋ `VARIANTS`（kind 一律 probe ✓）＝ 322 ✓；`.test.mjs` 裸作业 250 = suites；`322−250=72` = probes ✓。
**vmu 子集**：`GATE_SCOPE=vmu` ⇒ **460 作业**（396 套件 + 64 探针/变体，**作业计数**；**由 `--scope-report` 派生** ✓）
**更新方式（2026-10-14 更正 ✗✓；PHASE 6 再更正 ✓）**：旧文写"`scripts/update-doc-counts.mjs` 只**整行重写 4 处**……**不含** `vibe-math-vmu/docs/**`" —— **该说法已过期** ✗。实读该脚本：它覆盖 **6 处**（两个 README、`docs/test-timing.md`、`docs/AUDIT-CHECKLIST.md`、**本卷两行**），本卷的 `shipped.*` 行与"vmu 子集"行都按标记**整行重写**（**不要手改** ✓）。★ **PHASE 6 修复的残留缺陷**：此前"vmu 子集"行**永远不会被重写** —— 它想用 `GATE_SCOPE=vmu` 下的 `--counts` 派生，而 `--counts` **按设计**是作用域无关的，脚本只能拒绝并留一行人工数字（**永久说谎** ✗）。现在改为从 `node tests/run-tests.mjs --scope-report` 的 `scopes.vmu` 派生（只派生、不跑作业 ✓），该行**由 `--write` 自动跟随**；`--check` 与 `--write` 的差集即为待同步项 ✓。

### 5.2 可原样复用的**通用基础设施** ✓

| 资产 | 规模 | 为何通用 |
|---|---|---|
| `tests/run-tests.mjs` | （行数不手写 ✓） | 并行 runner（LPT 调度、gate scope、增量/全量、HEADSTART、`--counts`/`--self-check`）；**与预设代数完全解耦**（文件名约定＋目录扫描） |
| `tests/run-tests.mutants.mjs` | （体量不手写 ✓） | 对 runner 自身的变异族（证明其判红能力） |
| `tests/helpers/doc-counts-format.mjs` | （体量不手写 ✓） | **单一定义**所有计数句子（writer/guard/mutant 三方共用） |
| `tests/helpers/math-computation-fake-seam.mjs` | （体量不手写 ✓） | **假宿主接缝范本**：不装任何引擎也能驱动全分支 ⇒ **正对应 §4.1 的接缝要求** ✓ |
| `audit-package-membership`／`audit-path-discipline`／`audit-artifact-docs`／`audit-status-report-fields`／`audit-engine-faces` | （体量不手写 ✓）| 机制级守卫（包成员资格、路径纪律、产物文档、status/report 字段、真引擎三面＋`SKIP` 不算红）⇒ **模式直接照抄** |
| 28 个 `*.mutants.mjs`（实测） | — | "具名单点变异 ＋ 要求守卫变红"的**范式**可复用（内容需重写） |

**预设接线专用守卫（每次加预设都要跑，7 个）** ✗✓：`audit-preset-rows.test.mjs`、`audit-preset-declaration-group.test.mjs`、`audit-preset-mechanism.test.mjs`、`audit-installer-compat.test.mjs`、`audit-installer-policy.test.mjs`、`audit-installer-assertions.mutants.mjs`、`audit-readme-counts.mjs`。

### 5.3 必须**重建**的（与具体代强耦合）✗

- 全部 `*-v5*`／`*-v4*`／`e2e-v*`／`formal-verify-v*`／`math-computation-v*`：**断言的是某代源码的具体文本与行号** ⇒ 内容重写（例：`e2e-v5-round2` 218 KB、`selfdrive-v5`＋mutants 285 KB、`v5-institute-fixes.mutants` 118 KB）；
- **`tests/audit-v5-integrity.mjs` 的双重身份陷阱** ✗✓：前半是 **v5** 的通用静态自检，文末 `:1448-1449` 起却是**只对 v5r 生效的 R10/S4–S15 门禁**（读 `v5rRaw` 逐条正则）。**要复用 v5r 的不变量，必须把这 900+ 行门禁一起搬走**，否则会**静默丢掉**所有"由门禁锁死"的不变量。

### 5.4 其它复用 ✓
| 资产 | 用法 |
|---|---|
| mock 宿主 harness（`selfdrive-v5.mjs` 模式） | **照抄结构**（mock `subagents`/`tools`/`systemPrompt`） |
| 语料快照 `prompt-corpus-*/` | 新建 `prompt-corpus-vmu/`（或**显式**复用，见 10-§6 第 9 步） |
| `scripts/update-doc-counts.mjs` ＋ `audit-readme-counts.mjs`(＋mutants) | **直接复用** |
| `audit-v5-integrity.mjs --self-probe` 范式 | **照抄**：门禁自身要有唯一点变异自证 |
| `scripts/release-check.mjs`、`docs/release-playbook.md` | 复用并扩展 vmu 步骤 |

---

## 6. 纪律（沿用本仓已验证的硬规矩，全部保留）

1. **未验证的改动不得留在树里**；**红树不得提交**；**红树不得写基线**；
2. **门禁期间不写文件**（D-1）；
3. **一律 `*> 文件` 再筛**（`| Select-Object -First N` 会截断管道并提前杀子进程 ⇒ `exit=-1` 是截断不是失败）；
4. **内容锚点优先**（编辑后行号失效）；
5. **同一文件多片串行**（派单前先查写者）；
6. **报告必须写明"隔离跑/全量跑"**；
7. **未亲见标未核**；**注释里不要写会被门禁计数的代码字面量**（本仓实测两次踩坑 ✗）；
8. **具名红**：任何失败必须能说出"哪条断言、期望什么、实际什么"；
9. **行号口径（新，2026-10-09 实测）**：**旧线** `vibe-math-v5r.js` 是**纯 LF**（实测 `LF=11597 CR=0 CRLF=0`，真实 11,597 行）✗，而 PowerShell `Get-Content` 报 **11,269** 行、且**越往后偏差越大**（例：`registerTool('vibe_v5_record_method')` 真实 **11155** vs Get-Content 口径 **10827**，差 328）⇒ **禁止用 `Get-Content`/`Select-String` 抓行号**；一律用 **`ReadAllLines` 口径或 ripgrep（本 agent 的 grep/read 工具）**，并在文档里注明口径 ✓。
10. **能力接缝纪律**（见 §4.1）：外部能力探测必须可注入；**不得**用"本机有没有 X"当测试前提 ✓。
11. **扫描期间不得改变作业集合**（2026-10-09 实证 ✗✓）：`tests/run-tests.mjs` 会**扫描 `tests/` 顶层**来派生作业 ✓，因此在**任何全量扫描进行中**新建/删除/改名 `tests/*.mjs` 会让"文档计数守护"看到**不同的派生值**而与本次扫描的作业表冲突（实测：扫描起始 117，守护重算 118 ⇒ `audit-readme-counts` 红 ✗）。我先前"未列入 `files[]` 的新文件对门禁不可见"的推断是**错的** ✗。⇒ **纪律**：长扫描期间**只允许改不参与作业派生的文件**；新建测试必须**在 T0/T3 之外**做，并由 **T0 `--for-t3` 的工作树干净检查**兜底 ✓✓。
12. **源码级断言必须写成"语法形状"，且源码散文不得含同形字面量**（2026-10-09 **三次**实证 ✗✓）：我三次被自己的**注释/字符串**绊倒 —— ① `math.js` 注释里的"必须形式化"字样触发零策略检查 ✗；② `members.js` 注释里列出角色名触发 D5 检查 ✗；③ `script-bridge.js` 的 `status().note` 里写出 `appendPrompt` 触发"无提示词写路径"检查 ✗。⇒ **纪律**：① 断言一律锚定**代码形状**（如 `\bname\s*\(` 调用、行首属性键、`= true` 赋值），**不锚定裸词** ✗；② 被检查文件里的**注释与文案不得包含该形状的字面量** ✓（用"prompt action"这类描述替代 ✓）；③ 新写一个"源码不得含 X"的断言时，**先想一遍哪些散文会命中它** ✓✓。
13. **不得用 shell 字符串手术改结构化文件**（2026-10-09 实证 ✗✓）：我曾在 PowerShell 里用 `Get-Content -Raw` ＋ `.Replace(...)` ＋ `[IO.File]::WriteAllText` 改 `package.json`，**编码往返把非 ASCII 破坏成了非法 JSON** ✗（`Bad control character in string literal` ✓），当场被 `node -e "require('./package.json')"` 与计数脚本抓住 ✓。⇒ **纪律**：① `package.json`／生成物／任何结构化文件一律用**编辑工具或生成器**改 ✓，**绝不**用 shell 字符串替换 ✗；② 改完**立即**用解析器验证（`require`／`JSON.parse`／生成器 `--check` ✓）；③ 弄坏即 **git 恢复**再重做 ✓（本次即如此 ✓）。

### 6.1 拆出一个新模块的清单（★ 2026-10-15 立；R10 `meetingleave.js`、R11 `meetingmarker.js` **连续两轮**同型遗漏）

**背景（实测）**：两轮各从大文件里拆出一个新模块（`meetingleave.js` 抽会议请假规则；`meetingmarker.js` 抽 F51 域标记族），两轮都只做到"**文件能跑**"就收工，**对外登记漏了**——而**没有任何一个门禁同时抓两面**（见 ③／⑤ 的"只抓一半"）。**完成判据不是"文件分出来了"，而是下面 ①–⑤ 五条全绿。**

| # | 步骤 | 判据（怎么算做完） | 现状与"只抓一半"的证据 |
|---|---|---|---|
| ① | 新模块进 **`package.json` 的 `files[]`** | `node tests/audit-package-membership.mjs` 绿 **＋ 正面自查**：`node -e "console.log(require('./package.json').files.includes('vibe-math-vmu/kernel/<名>.js'))"` 必须 `true` | ★ 该门**只抓** `tests/*.mutants.mjs` 与"守卫索引引用的测试文件"。★ **原文那句"只抓 mutants 与守卫索引引用的测试文件、不扫内核"是错的、已实测更正**（★ R14：`vmu-pack2` 用该门自带的 `PACKAGE_JSON` 接缝指向 `D:\_tmp` 副本、**只删** `vibe-math-vmu/kernel/meetingmarker.js`）⇒ **门真的红并具名**：`12 passed, 1 failed` EXIT=1，报 ``vibe-math-vmu\kernel\meetings.js -> ./meetingmarker.js``；`tests/audit-package-membership.mjs:75-84` 的 `walk(VMU, 0)` **就是扫 `vibe-math-vmu/**`（并含 `tests/`）** ⇒ **"新内核模块漏登记它不会红"这条归因不成立**（第十三条：更正一条声明就要改掉那条声明）。★ **真正剩下的洞是另一格**：**磁盘上有、却没有任何 import 指向它**的出货文件（装载器按**算出的路径**动态 import、pack 纯数据按目录名读）⇒ 实测 **7 条**在两份清单之外（`docs/audit/` 6 份 ＋ `packs/example-data/README.md`），**静态 import 闭包结构上看不见它们**；登记/豁免与这条新判据归 R14 门禁扩展，证据在 `_handoff/vmu/pack-round14-report.md` §B。正面自查仍保留（它是**成本最低的当场证据**） |
| ② | 新模块进 **`installer.js` 的 preset 管理清单**（`PRESETS[].files` 那一长串） | 装机后文件真的落到 `<profile>/vibe-math-vmu/kernel/` | 现清单在 `installer.js:93` 一行内（已含 `meetinglapse/meetingleave/meetingmarker` ✓）；`tests/audit-installer-*.test.mjs` 覆盖清单的**格式与策略**，"新模块是否进清单"仍要靠 ① 的同类自查 |
| ③ | **zero-mechanism 矩阵加裁定行**（`scripts/generate-zero-mechanism-matrix.mjs` 枚举 `kernel/*.js`，每模块一行） | `node scripts/generate-zero-mechanism-matrix.mjs --check` 绿，且该行**期望**取自**实测形状**（生成器不带参跑一次即可读到"零机制下的返回形状"列） | ★★ **实测的洞**：`judge()` 里"探针抛出"的跳过（`:265`）**排在**"出现了却没有裁定行 ⇒ 红"（`:270-274`）**之前** ⇒ **无码抛出**的模块被算成 probe-error **且不记名**：`meetingleave`／`meetinglapse` 今天在生成矩阵里仍是「（**设计未定** ✗：本模块未登记期望）」，而 `--check` 依旧报 **0 unregistered** ⇒ 必须**人眼读生成矩阵**或先给它一行 |
| ③′ | **期望词表是闭集**（写错＝mismatch 红） | 只能写：`具名拒（带 code）`／`具名拒或 ok`／`ok 或 object`／`ok 或 null`／`array 或 object`／`array`／`ok（显式 absent）`／`按声明默认开成`；或登记为 `PROBE_NEEDS_ARGS`（缺参待补）／`EXPECT_UNDECIDED`（**显式待办**，只计数不红）／`EXPECT_NA`（非服务模块） | 轮 12 实测：**裸 `object` 不是词表值** ⇒ `okShape=false` ⇒ **mismatch 红**（对象面要写 **`ok 或 object`** ✗✓） |
| ④ | **边界写进文件头**（三行内） | 文件头说明：本模块**拥有**什么／**不拥有**什么（消费谁、委托给谁）／**零机制下的形状** | 例：`records.js:16`（"in-memory projection whose records can be handed to it"）、`meetingleave.js:5-10`（"owns the RULES；state seams are injected"）、`meetingmarker.js` 的"域派生／接缝／读面"三句 |
| ⑤ | **每步跑一个"加载内核"的套件** | `node tests/vmu-kernel.test.mjs` ＋ 该模块自己的套件；**拆完后**再跑 `node tests/vmu-entry.test.mjs`（真入口装载） | 理由：拆文件最容易坏的是**装配**（import／构造顺序／新接缝），不是被抽出的纯逻辑 ⇒ 只跑"该模块的单测"会**漏掉装配面**（R11 拆分后真正的红恰好出现在 `vmu-resume-e2e`／`vmu-meetings` 这类装配级套件 ✓） |

> **记号**：本清单的 ①／② 是**对外发布面**，③／③′ 是**零机制裁定面**，④ 是**可读性契约**，⑤ 是**装配回归**。缺任一条，代码"能跑"但**不算拆完**。

---

## 7. 发布门禁（Release Gate）

```
node tests/run-tests.mjs --counts          # 作业/套件/探针计数
GATE_RELEASE=1 node tests/run-tests.mjs    # 全量非增量（红树拒绝写基线）
node scripts/update-doc-counts.mjs --check # 文档计数一致
node tests/audit-v5-integrity.mjs --self-probe   # 门禁自证（每条门都有唯一点变异）
node scripts/release-check.mjs             # 发布前清单
```
**出口条件**：以上全绿 ＋ 本表 `§2` 无空缺 ＋ 变更日志/文档同步 ＋（若有 pack）对照报告已生成并分类。

### 7.1 三档门禁（**成本纪律**；用户 2026-10-09 指出全量太贵 ⇒ 制度化 ✓）

全量非增量 = **322 作业**（**2026-10-14 由 `node tests/run-tests.mjs --counts` 派生** ✓；旧文写 **117 作业 ≈ 25 分钟** ✗ 已过期）。**成本必须现场量，不要引用单一数字** ✗✓：仓库里同时存在**三个互斥**的说法 —— `docs/test-timing.md` 的「≈121–200 s」、`tests/run-tests.mjs` 文件头的 **1447.6 s（自述为"模拟值"）**、以及本卷 §9.7 记录的 2026-10-09 三次 T3 实测 **各 ≈31 min**（当时 132 作业）⇒ **以现量现报为准** ✓。⇒ **不能每次改动都付** ✗。改为**三档**，每档都保留"发布级诚实"：

| 档 | 触发时机 | 命令 | 实测成本 | 覆盖什么 |
|---|---|---|---|---|
| **T0 预检**（**新增，硬前置** ✓） | **任何 T2/T3 之前**（用户 2026-10-09 要求："先全面自查无误再跑，避免跑半天才发现问题" ✓） | `node scripts/preflight.mjs [--for-t3]`（**2026-10-14 按 D-05 进仓** ✓ —— 旧路径 `_oneoff/vmu/tools/preflight.mjs` 在仓库外、干净 clone 跑不到 ✗） | **≈1 min** ✓ | ① `--counts` 与文档计数一致 ✓；② `build-preset-rows --check` 无漂移 ✓；③ 预设/installer/包成员/计数/路径/数学契约/产物文档 等**共享面门禁全跑** ✓；④ **`files[] ↔ installer PRESETS ↔ 工作树` 三方一致性**（**上一轮 T3 才发现的那类漏登记** ✗✓，已被固化为预检项 ✓）；⑤ vmu 文档 linter（`scripts/check-docs.mjs`，**D1–D16 ＋ notes**；旧文写"17 关"是手打数字 ✗，linter 从不报这个数 ✓）；⑥ `run-tests --self-check` ✓；⑦ `--for-t3` 额外要求**工作树干净**（无未接线的未跟踪件 ✗） |
| **T1 迭代档** | **每一次改动**（默认档） | `GATE_SCOPE=vmu` | **覆盖 258 作业**（**2026-10-14 由 `--scope-report` 派生** ✓）；**成本本轮未量** ✓（旧文"≈132 s／117 作业" ✗ 已过期 —— 耗时主张与计数一样会飘 ✓，**除非有人去量** ✓） | vmu 全部作业 ＋ **所有共享面门禁**（预设行/生成物、installer、包成员、文档计数、路径纪律、产物文档、共享数学模块与契约、runner 自测、临时卫生 ✓） |
| **T2 共享编排档** | 改动 **`tests/run-tests.mjs`／`tests/helpers/**`／`scripts/build-preset-rows.mjs`／`cordis.patch.yml`／`installer.js`／`package.json`** 时 | `GATE_INCREMENTAL=1`（**全量**，按 `FAMILY_TARGETS` 跳过"目标文件没变"的族 ✓，未登记者**照跑** ✓） | 通常 **≈2–5 min** ✓（未在 2026-10-14 复核） | T1 ＋ **受影响的跨预设族**（含 v2–v5r 的行为面 ✓）；跳过的是**我根本没碰**的目标族 ✓ |
| **T3 发布/阶段档** | **每 2–3 个阶段**（如 P2+P3 合并一次）＋ **任何发布/推送发布物之前** ＋ 收尾 | `GATE_RELEASE=1`（**非增量全量** ✓） | **未在本轮实测** ✓（§9.7 的历史记录：132 作业时 3 次 T3 **各 ≈31 min**，其中 2 次红，唯一红因是 v5 的变异族 ✓） | 全部 **322** 作业，含最重的那条 v5r 变异族 ✓ |

**纪律**：① T1 红必停 ✗；② T2/T3 的结果必须**写明是增量和非增量** ✓（避免"隔离跑 vs 全量"误判 ✓）；③ **发布前必须有一次 T3** ✓（这是"发布验收"的硬条件，不因省时而免除 ✓）；④ 任何"共享面"缺陷若只在 T3 才能发现（如上一轮的 installer 漏登记 ✗），**必须在同一轮内补进 T1 的覆盖清单** ✓✓ —— 否则 T1 会长期漏网 ✗。

> **本档位制度的第一批实证** ✓：T1 已在 34 作业 / **62.9 s** 内抓到过多起问题（installer 漏登记、计数漂移、scope 与机器模式冲突 ✓）；T3 已两次产出发布级绿（`P0: 111/111` ✓、`P1 里程碑在跑中` ✓）。
>
> ★ **2026-10-14（交接轮）T0 状态 = FAIL，两处具名原因** ✓：① **vmu 文档 linter 24 issues**（`scripts/check-docs.mjs`；分布 D2×5／D3×2／D4×5／D5×2／D8×5／D9×3／D15×2；**移交前就已红** —— 把仓库外那份 `_oneoff/vmu/tools/check-docs.mjs` 原样跑出**字节级相同**的输出（`docs=29 issues=24 notes=24`），⇒ **与本轮"搬进仓库"无关** ✓）；② **文档计数未收敛**（本轮新增 1 个作业 ⇒ `scripts/update-doc-counts.mjs --check` 报 WOULD CHANGE；按 D-07 由 Lead 在全员停写后统一 `--write` ✓）。★ 上面的"34 作业 / 62.9 s"是**当时的规模**（现为 **258** 作业）✗，保留为历史 ✓。

---

## 8. 未核项

- **官方验证的完整清单**已抽成 G1–G13（来自 C′ 对 `references/verification.md` 的提炼）；其中"**无浏览器控制时的上限**"（只允许 JS 语法 ＋ manifest 校验 ＋ 活 Client slot 注册）是**文档级**逐字结论 ✓；
- **Client 侧活读数未核**（本机 `Slots.listSubTree` 超时）⇒ GUI 相关门禁暂缺，见 14-§1（O2）；
- **`app.asar` 直读不可用**（本 agent `read` 工具 BigInt 缺陷）⇒ 读官方材料需自写 asar 解析＋SHA256 校验，见 14-§3（R-5）。
- **`math-computation.js` 的 canonical 快照：Round 2 已收口（vendored ＋ 语义级对照）** ✓（2026-10-14）：① 引用**已进仓**为 `tests/fixtures/mc-P1-ready/{math-computation.js,math-engines.js,tool-schema.json}`（登记 `package.json#files`；D-05 修订口径＝仓库级/夹具只登记 `files[]`）⇒ **干净 clone 可复现** ✓；② `tests/audit-math-computation-parity.mjs` 的判据**已按 D-10(1) 改为语义面**（导出名与 typeof、失败码/参数名**集合**＋可达性、参数默认值、`MATH_TOOL_SCHEMA` 结构、引擎描述符与 `candidates` 顺序、**唯一逐字项**＝注入模型的合同文本），**字节对照降为一条具名断言**（冻结标记）✓；③ 实测 **141 passed / 0 failed（EXIT=0）**，并用 `MATH_COMPUTATION_MODULE` seam 注入"改名一个失败码 ＋ 改一个默认值"**证明两条具名断言会红** ✓。★ **必须记明**：vendored 的 canonical **是按当前随包副本刷新的**（旧快照 `6c9c9f13…` 2026-10-03 早于随包副本 `def90af7…` 2026-10-05；`math-engines.js` 本就一致 `a4891a03…`；`tests/fixtures/mc-P1-ready/tool-schema.json` 原样 `0552e61f…`）⇒ 本行只声称"引用进仓、判据语义化、断言可真红"，**不**声称共享模块在语义上绝对正确。**详见 14-§2（U13）** ✓。
- **两个 env 注入缝：`MATH_CANON_DIR` 与 `MATH_SCHEMA_FILE`** ✓（**2026-10-14 登记** ✓）：**默认已不指向仓外** —— 语义级对照用的是仓内夹具 `tests/fixtures/mc-P1-ready/` ✓；这两个 seam 现在只用于**备用/变异副本**（dev 检出里的历史副本、或 `MATH_COMPUTATION_MODULE` 式的变异证明）；**把 seam 指向不存在的路径** ⇒ 该守卫走**具名 SKIP**（打印原因），因此日常门禁**不依赖**它们 ✓。★ **它们不是错误码** ✗：`MATH_*` 这个记号前缀被**共享模块的拒绝码**与**这两个环境变量**同时使用 ⇒ `tests/audit-vmu-docs.test.mjs` 的"文档里出现的每个 `MATH_*` 记号都必须在 03-§8 登记"一度把这两个 env 名**误报**为未登记错误码 ✗✓；该守卫的豁免现已改为**从代码派生**（凡被本仓 `process.env.<NAME>` 读取的同前缀记号，即视为 env 缝 ✓），并断言该豁免**非空且真被用到**。★ **与 U13 同源**：**详见 14-§2（U13）** ✓。

### 8.1 真机实测新增（2026-10-09，证据在 `_oneoff/vmu/live/2026-10-09/` ✓）

- **预设能装、注册面可见：已实测 PASS** ✓（临时 `DSH_HOME` ＋ `dsh plugin add <本仓>` ⇒ `dsh --profile <p> --dump-config` 的合成树含 `- id: preset-vibe-math-vmu`，**headless 与 web 两种随包模板各验一次** ✓；插件行 `name: dsh-vibe-math/vibe-math-vmu/vibe-math-vmu.js` 解析正确 ✓；六代预设同在 ✓）。
- **会话能起：已实测 PASS** ✓（`dsh --profile vmu-h "<task>"` 多次 exit 0 ✓；`--json` 给出机器可读事件流 ✓）。
- **headless 无法选择预设（本轮新发现 ✗✓）**：`dsh --profile headless --help` 的 Options **只有** `--json`／`--session-id`／`-h` ✗；`--json` 事件流里**没有任何 preset/tool 信息** ✓；而 `ctx.agentPresets` 的选择手段是 **程序化 `select(agent, id)`／`mount(ctx,id?)`** 或 **GUI 预设选择器** ✓（我方 DSH 面重建 §3.9 逐字 ✓）⇒ **"预设激活"与"vmu 工具面可见"在 headless 下不可达** ⇒ 按 §9.2⑥ 记 **NON-RESULT**（**不记通过、也不记失败** ✓）。⇒ **P5 真机集的前置**：需要一个能选择预设的宿主入口（GUI 或程序化 `select`），见 14-§7 待办 ✓。
- **`agentPresets.compositionInventory()`／`readDocument()`／`composeFrom()` 未核** ✗（headless 不可达 ⇒ 与上一条同源）。

### 8.2 宿主**工具形态**（真机实证，2026-10-09；三条都曾让工具**静默消失** ✗✓）

| 约束 | 证据 | 我们踩的坑 |
|---|---|---|
| 执行函数键名是 **`execute`** ✗不是 `handler` | 本仓可用预设 `vibe-math-v5r.js:10934-10938` ✓ | 写成 `handler` ⇒ 注册成功但工具**永不出现** ✗ |
| `output` **必须**有 `schema` ＋ `render`；`presentationMeta` 若出现**必须是函数** | 宿主源码 `dsh-tools/lib/index.js:2881`（**从 app.asar 读出** ✓）：`output === void 0 \|\| typeof output !== 'object' \|\| typeof output.render !== 'function' \|\| (output.presentationMeta !== void 0 && typeof output.presentationMeta !== 'function') ⇒ throw TypeError(...)` | 写成**对象** `{title}` ⇒ 抛错，且消息**不指出哪一条** ✗ |
| `parameters` **必须**是对象型 JSON Schema，且 `required` 是**顶层数组** | 真机会话日志逐字：`Invalid schema for function 'vibe_vmu_status': schema must be a JSON Schema of 'type: "object"', got 'type: null'` ✓ | 传 `{}` ⇒ **供应商**拒绝并**整轮失败** ⇒ 表现为**静默 0-token 回合** ✗✓ |
| 注册必须包在 **`ctx.effect(fn,label)`** 并交出 cleanup | 宿主指引（我方面重建 §A ✓） | —（我们一开始就遵守 ✓） |
| **失败必须可见** ✗不得吞 | 我们自己的 R11 | 入口曾 `catch(()=>{})` 吞掉安装错误 ✗ ⇒ 上述第 2 条**因此长期不可见**；改为 stderr ＋ `status().installError` 后**立刻现形** ✓✓ |

> **方法论收获**：**库测试用自己假设的形态** ⇒ 永远抓不到这三条 ✗✓；真机（脚本化 SLV）＋ **直接读宿主源码/会话日志**才是判据 ✓。⇒ 已固化为 `tests/vmu-host.test.mjs` 的**形态断言**（`execute`／无 `handler`／`presentationMeta` 缺省或函数／`parameters.type==='object'` ＋ 顶层 `required` ✓）。

### 8.3 多实例（真机发现；处置已定 ✓）

一个 profile 里可以同时存在**两个 vmu 实例**：预设自带的插件行（无 config ⇒ 惰性）＋ profile patch 插入的独立行（带 config）。
- **宿主对同层同名工具只保留一个** ⇒ 实测出现"**观测面分裂**"：`vibe_vmu_status` 由**惰性实例**回答（`packs: []`、`members: null`），而 `vibe_vmu_middleware` 由**带 config 实例**回答（能列出整合包规则）✓；
- **嵌套的预设行不可由 profile 层寻址**：试图 `- id: vibe-math-vmu / disabled: true` ⇒ 宿主回报 **`patch: entry "vibe-math-vmu" not found`** ✓；
- **处置（保守、低风险 ✓）**：每个 vmu 实例在回执里**自证身份** —— 入口接受 `config.instance`（缺省 `vmu-default`，**确定性**以便测试），`vibe_vmu_status` 与 `adapter.status()` 都带 `instance` ✓✓；文档写明：**"同层同名由宿主裁决，故每个 preset 只应有一个 vmu 实例；多实例必须各自 `config.instance` 以便排障"** ✓。

---

## 9. 真机验收（E 类门禁：SLV playbook）

> **为什么需要**：mock 宿主能证明"逻辑对"，**不能**证明"在真宿主里装得上、跑得起来、状态可读"。v5r 的教训是**真机复验必须是独立判据**（其 `08-landing-plan` 的 SLV 一节即为此设）。本类门禁**不得**用 mock 结果替代 ✓。

### 9.1 前置条件（每项都要记录"满足/不满足＋证据"）
1. DSH 已安装且可启动（记录版本；**version gating 走 `peerDependencies`** ✓，`engines.dsh` 不存在 ✗）；
2. 预设装载机制＝**rows**（DSH ≥0.1.7，不写盘）或 legacy **directory**（≤0.1.6）⇒ **记录实际机制** ✓；
3. 工作区可写；`vmu/` 目录可创建；
4. 外部工具链**是否存在都要记录**（本机实测 LaTeX=`D:\texlive…`、Lean=`D:\.elan…`，**在 PATH** ✓）⇒ 负例必须由**注入接缝**制造（§4.1），**不得**依赖"本机没有" ✗。

### 9.2 步骤（可复跑）
```
① 安装/装载 vmu 预设  → 断言：预设出现在宿主预设列表（rows 机制下磁盘无副本，必须查注册面）
② 起一个会话          → 断言：内核启动、Store 打开、状态可读
③ 跑脚本化场景        → 逐条驱动公开工具（如 status / set / pack / mw）
④ 采集证据            → status 快照 · 磁盘产物 · 具名拒绝（含 code） · 审计尾部
⑤ 对照期望            → 每条期望都是**具名断言**（期望什么/实际什么）
⑥ 不可用即 NON-RESULT → 宿主能力缺失时**如实记 NON-RESULT**，绝不记为通过 ✗
```

### 9.3 证据落盘格式（**唯一写入点**，仓库外）
```
_oneoff/vmu/live/<YYYY-MM-DD>/<scenario>/
├── notes.md          # 前置条件、机制(rows/directory)、版本、时间、执行者
├── status.json       # status() 原样快照（含 settings.resolved / middleware / prompts）
├── transcript.md     # 逐步命令与回执（含拒绝码）
└── artifacts/        # 磁盘产物（目录树 + 关键文件）
```
**纪律**：① 采集期间**不得**有其它写者（D-15／D-1）；② 报告必须写明**隔离跑/全量跑**与**是否带沙箱接缝**；③ 每个场景必须给出**具名结论**（通过／失败／NON-RESULT）✓。

### 9.4 各期最小验收集（P0–P5）
| 阶段 | 真机必须证明 |
|---|---|
| **P0** | 预设能装、会话能起、`status` 能读、设置能改（含热改等级提示） |
| **P1** | 六域能力各一次真实调用；耐久在**杀进程**后恢复；归档产物落在磁盘预期位置 |
| **P2** | 四形态各一次真实生效 ＋ 一次真实拒绝（含中间件 id） |
| **P3** | v5r-pack 对照跑（同场景两边各一次，产出差异报告） |
| **P4** | 脚本形态真实运行；公开服务版本可读 |
| **P5** | 发布清单全过；GUI（若做）在真实页面注册成功（受 O2 前置条件约束 ✓） |

### 9.5 与发布门禁的关系
§7 的发布门禁是**机器可跑**的部分；**真机集是它的前置证据**：没有 §9.3 的证据，发布门禁的"全绿"**只代表 mock 面** ⇒ 出口条件里必须附**真机证据路径** ✓。

### 9.6 真机矩阵（截至 2026-10-10；每条后面是证据目录 ✓）
> ★★★ **逐行核实结论（★ 轮 518 实测 ✓ —— 本项在清单上结转了 17 轮 ✗）**：
> - ★★ **本表共 **12** 行 P0–P2 项** ✓（`P0` 5 行／`P1` 2 行／`P2` 5 行 ✓），★ **状态全部 `PASS`** ✓；
> - ★★★ **12 行的"证据"列已【逐条实测**]✓：★ **全部解析到【工作区根**]的 `_oneoff/vmu/` 之下** ✓，★ **12 条真实证据目录【全部存在**]✓**（★ 轮 498 实测 ✓；★ `…/` 简写按"上一行同一天目录"解析 ✓）；
> - ★★ **所以本表的每一行【都有可复核的产物**]✓，★ **且产物的位置由本节自己的基准说明决定** ✓（★ **见下方"证据路径的基准"** ✓ —— ★ 轮 629 更正：★ 原写"见上方"，★ **而那段基准说明在【本节末**]、★ 即【下方**]✗✓）⇒ ★ **本项结论：表与证据【一致**]，无需改动** ✓。

> 全部在**隔离** `DSH_HOME`（`D:\_tmp\dshvmu`）＋ **脚本化 SLV**（`_oneoff/vm-drive/dsh-drive.mjs`，显式 `--preset vibe-math-vmu`）下取得；**用户的 `desktop` profile 与仓库均零改动** ✓。

| 期集（§9.4） | 项 | 结论 | 证据 |
|---|---|---|---|
| P0 | 预设能装（注册面可见） | **PASS** ✓ | `live/2026-10-09/preset-registration/` |
| P0 | 会话能起 | **PASS** ✓ | `…/session-boot/` |
| P0 | 预设激活（persona 逐字 ＋ 工具面） | **PASS** ✓✓ | `…/p0-final/` |
| P0 | `status` 能读 | **PASS** ✓✓ | `…/p0-final/` |
| P0 | 设置能改（含热改等级回执） | **PASS** ✓✓ | `…/p0-configured/` |
| P1 | 耐久写（记录 ＋ `state.json` 落盘） | **PASS** ✓✓ | `…/p1-durable-write/` |
| P1 | **杀进程后恢复**（同 id／同指纹） | **PASS** ✓✓ | `…/p1-durable-recover/` |
| P2 | M1 规则真机生效（拒绝含中间件 id） | **PASS** ✓✓ | `…/p2-real-hooks/` |
| P2 | **M2 代码模块真机生效**（装载＋决定） | **PASS** ✓✓ | `…/p2-m2-in-host/` |
| P2 | M4 整合包真机应用（规则 enabled） | **PASS** ✓✓ | `…/p2-pack-in-host-single/` |
| P2 | 实例身份自证（多实例可辨） | **PASS** ✓✓ | `…/p2-instance-identity/` |
| P2 | **M3 脚本形态真机运行** | **PASS** ✓✓（M3 已解除，2026-10-10 ✓） | `live/2026-10-10/p2-m3-stack4/` ✓：回执 `{"ok":true,"action":"run","script":"probe","ran":true,"exit":0,"policy":"open","timedOut":false,"summary":"script ran","findings":[],"data":null}` ✓（前三轮 `p2-m3-stack{,2,3}/` 保留对照 ✓） |

> **M3 的解除过程（留证 ✓，2026-10-10）**：前三轮真机 NON-RESULT ✗ 的**首要原因不是宿主，而是我方接缝把诊断丢掉了** ✗ —— `kernel/script-bridge.js` 的 catch 重写了错误却没回挂 `hostStack`/`shape` ⇒ 工具面回执里**永远没有宿主栈** ✓（独立验证用**注入接缝**证明了这次丢失 ✓）。把"搬运"修好之后，栈逐帧钉死炸点：宿主 **`dsh-subprocess-local`** 的 `validateNoNullByte @ runner-launch-*.js:1509` ← `targetEnvironment:1520`（它校验 **`options.cwd`**）⇒ **该宿主不容忍 `cwd` 为 `undefined`，连"省略 `cwd` 键"也会崩 ✗**（实测 `p2-m3-stack3/` ✓）。
> **修法（调用侧规避，不是修宿主 ✗）**：`host-spawn.js` 现在**永远传一个真实字符串 `cwd`** ✓（调用方 cwd → 配置工作区 → `process.cwd()` ✓），并对 `env` 做同样的"**只允许字符串**"归一化 ✓（`undefined` 值会炸同一个函数 ✓，两道保险 ✓）。
> **结果** ✓：**同一命令、同一探针**下本轮**通过** ✓（`p2-m3-stack4/` ✓），且**不再出现任何 `hostStack`** ✓。**残留事实（诚实 ✗）**：该宿主缺陷**依然存在**（公开包，本仓无法修 ✗）；我们提供的是**每个调用方都得自己带的规避** ✓。
> **旁注** ✓：早期"已排除的四项"（id／接缝／spec 形状／PATH）**全都没排错** ✓ —— 真正原因是**诊断被吞** ＋ 宿主对 `cwd` 的**零容忍** ✓。
| P3 | v5r-pack 对照跑（**面级对照已完成** ✓；★★★ **行为级 A/B【已完成**]✓） | **PASS** ✓ | ★ **双向量化**（`tests/vmu-ab-v5r-verification.test.mjs` ✓）：★★ **正向：原版固定散文中 706/823 行被复现（86%）；只看散文（排除对象名/任务板/状态等数据行）则 632/642（98%）** ✓；★★ **反向（fidelity）：我方言中 398/1478 行出现在原版真实投递的提示里（27%）** ✓ —— ★ 该数【不可靠转写更多文本抬高**]✓。★ **口径纪律**：★ **按类型的分数取【调用者应当变化的输入之并集**]✓，**而 fidelity 必须用【单变体**]（否则并集虚增分母 ✓）；★★ **全语料只剩【1 条不同的未复现行**]（紧凑目录另一版本，构造上不可闭合 ✓）⇒ 报告 `_oneoff/vmu/design/04-v5r-contrast-live.md` ✓ |
| P4 | 公开服务版本可读（`contract()`） | **部分** ✓（库内 ✓；真机未读） | —— |
| P5 | 发布清单全过 ＋ GUI（O2 前置） | **未做** ✗ | —— |

> **诚实口径**：上表**只写已取得证据的行** ✓；未做的一律写"未做"✗，**不得**用库内测试冒充真机 ✓。
>
> ★★★ **证据路径的基准（★ 轮 497 补 ✓）**：★ **本表"证据"列用的是【简写**]✓ —— ★ **实际位置在【工作区根**]的 `_oneoff/vmu/` 下** ✓：★ **`live/2026-10-…/…` ⇒ `<工作区根>/_oneoff/vmu/live/2026-10-…/…`** ✓；★ **`…/<name>/` 一律是同一天同一目录下的兄弟目录** ✓。★★ **为什么必须写明**：★ **仓库里【没有**] `live/` 与 `_oneoff/`** ✓（★ 实测 ✓ —— ★ `_oneoff` 按裁定移到了工作区根，仓库内不再保留 ✓）⇒ ★★ **不写明基准，这些"证据目录"对读者是【无法解析的字符串**]✗** ✓。
> ★★★ **逐条核实结果（★ 轮 498 ✓）**：★ **12 条真实证据目录【全部存在**]✓；★ **另有 3 条"不存在"是探针自身的假象** ✗（★ 花括号展开 `{,2,3}` ✗、一条其实是仓库内测试路径 ✗、一条已经是工作区相对路径 ✗）⇒ ★ **证据链完整** ✓。
> ★★ **剩余真机项（明写 ✓）**：★ **P4 公开服务版本可读** ⇒ **部分** ✓（★ 库内可读 ✓、**真机未读** ✗）；★ **P5 发布清单全过 ＋ GUI（O2 前置）** ⇒ **未做** ✗。★★ **表内其余各期【都有证据目录**]✓ ⇒ **这张表可以照它的字面读** ✓ —— ★ 而**它的诚实口径正是让它可以被这样读的原因** ✓。

### 9.7 T3（非增量全量）运行记录

| 时间 | 命令 | 结果 | 备注 |
|---|---|---|---|
| 2026-10-09 19:55–20:26（31 min） | `GATE_RELEASE=1 node tests/run-tests.mjs`（前置 `preflight.mjs --for-t3` **PASS** ✓，工作树干净 ✓） | `TOTAL 132 PASS 131 FAIL 1` ✗ | 唯一红：`v5-institute-fixes.mutants.mjs`（1512.7 s ✓） |
| 2026-10-09 20:32–21:03（31 min） | 同上（修复红因之后 ✓，HEAD `ea81436` ✓、`dirty=0` ✓） | **`TOTAL 132 PASS 132 FAIL 0`** ✓✓ | **全仓非增量门禁全绿** ✓（含全部 vmu 工作 ✓） |
| 2026-10-09 22:57–23:28（31 min） | 同上（HEAD `45ec07c` ✓、`dirty=0` ✓；此前已补 V5 包、B1–B6、V7、V9、审计落盘、台账 ✓） | `TOTAL 132 PASS 131 FAIL 1` ✗ | 唯一红：**`v5-institute-fixes.mutants.mjs`**（1483.6 s ✓）—— **v5 的族，与 vmu 无关** ✓ |

**该红的定位（2026-10-09 第二次，同类 ✓）**：**定向运行**（`MUTANTS_ONLY='S25A'` ✓，8 s ✓）给出 **`4/4 具名红` ＋ `ALL MUTANTS RED AS REQUIRED`** ✓ ⇒ **该族在隔离下健康** ✓ ⇒ 本次红是 `14-§1` **R-6b 已记录的"全量负载下正向对照偶发"** ✗（同一族在两次 T3 之间曾 **132/132 全绿** ✓），**不是** vmu 缺陷、**也不是** v5 行为回归 ✓（我从未改动 v5 ✓）。
> **纪律（第三次同类 ✓）**：**"隔离绿／全量红"必须先跑定向再下结论** ✓（否则会把已知偶发误判成自己改坏了 ✓）。

**R-6b 的加固（2026-10-09，同日完成 ✓✓）**：**双侧**都改成"**失败 ⇒ 一次重试**"，且**重试必须被记录**、**重试仍红照样计入红** ✓ —— 正控侧（`scenario positive controls green: N/M (X retried, Y green on retry)` ✓）与**变异侧**（`mutant families reddening … (X family retries, Y matched on retry)` ✓）。
| 证据（可核 ✓） | 命令 | 结果 |
|---|---|---|
| 全部正控 | `MUTANTS_POSITIVES_ONLY=1 node tests/v5-institute-fixes.mutants.mjs` | **107/107 绿** ✓（**5 条首跑红 ⇒ 5 条重试即绿** ✓，~4.8 min ✓） |
| 正控自证 | `POSITIVES_SELFTEST=1 …` | `retry path exercised=true stillRedCountedRed=true` ⇒ **GUARD CAN FAIL AND IS COUNTED** ✓ |
| 变异自证 | `MUTANTS_SELFTEST=1 …` | `RETRY CANNOT MASK A RED FAMILY (as required)` ✓ |
| 定向变异 | `MUTANTS_ONLY='S25A'／'S21'／'G2'／'S8' …` | **4/4、6/6、1/1、7/7 具名红** ✓；写错名字 ⇒ **具名中止 exit=2** ✓ |

**第 9 次 T3（2026-10-10 10:26–10:59，33 min，HEAD `6b61362`，起点 `dirty=0`）**：`TOTAL 134 PASS 133 FAIL 1` ✗ —— 唯一红是 **`shard=1/3`**，具名原因 **`family did not redden by name: S5: the stalled path goes back to convening a meeting on its own (R1/D10)`** ✓（**具名清单再次生效** ✓）。
- **S5 定点诊断** ✓✓：S5 实为 **7 个族**；**隔离连跑 5/5 全绿（各 ~62 s）** ✓；分片内偶发 ✗ ⇒ **根因不是 S5 的代码，而是"重试跑在同一台仍然很忙的机器上"** ✗ —— **等待下限是"最小驱动时长"**，8 s 在双作业并发时**仍不够**让驱动循环走到被变异步 ✓。
- **修法（小而精准 ✓）**：重试改用**套件自己的耐心默认（30 s）** ✓（`PATIENT_WAIT_FLOOR_MS = 30000` ✓）；**只在失败时付** ✓，所以"168 族各付 30 s"的顾虑不适用于**单次重试** ✓。**下一次 T3 为验收依据** ✓。
- **S5 定点修复完成（2026-10-10 ✓✓，两轮试错后定论）**：实测三形态 —— ① 原变异（把 `emitStallNotice()` **整个替换**）⇒ `no named red (exit=1)`、35.6 s ✗；② "保留提示、另加违规召集" ⇒ 子进程 **exit=0**（变异**变惰性** ✗）；③ **回退原变异 ＋ 把 `expect` 换成它真实且稳定产出的那条**（`/S5-stall-notice：静止提示恰一条/` ✓；原 `expect`（`会议不变`）**不可达** ✗）。**证据** ✓：定向 `MUTANTS_ONLY='S5'` ⇒ **7/7 连续 3 次全绿** ✓；**上次失败的那个分片** `shard=1/3` 全跑 ⇒ **`families=56/56`、`positives=36/36`、`retries={0,0}`、`crashes=0`（8.8 min）** ✓✓。

**第 10 次 T3（2026-10-10 11:36–12:11，35 min，HEAD `86a9e03`，起点 `dirty=0`）**：`TOTAL 134 PASS 133 FAIL 1` ✗ —— 红点**又换了**，且**S5 已修好**（`shard=1/3` **通过** ✓✓）；本次唯一红是 **`shard=0/3`**，具名原因 **`positive control STILL red after retry: s6-not-granted`** ✓（pristine v5 场景、重试后仍红 ✗）。
- **隔离诊断（决定性 ✓✓）**：`MUTANTS_POSITIVES_ONLY=1 MUTANTS_SHARD=0/3` ⇒ **36/36 全绿**，`s6-not-granted` **1971 ms 通过** ✓，整组正控 **78 s** ✓ —— 而同一组在**全量扫掠内**要 ~9.5 min ✗ ⇒ **负载放大约 7×** ✓✓。**这就是所有偶发的共同机制** ✓（不是产品、不是脚本缺陷 ✓）。
- **据此改进（本轮 ✓）**：① 正控失败时**打印子进程自己的具名断言行**（无行则打印"无具名行 ＋ 原始输出长度" ✓）⇒ 下次**无需再单独复现** ✓；② 把 **7× 负载放大**这一实测写进文档 ✓（作为"隔离绿／全量红"判据的量化依据 ✓）。**下一次 T3 为验收依据** ✓。

**第 11 次 T3（2026-10-10 12:30–13:00，30 min，HEAD `8ffdf82`，起点 `dirty=0`）—— 🎉 验收全绿（第二次）✓✓**：
```
TOTAL 134  PASS 134  FAIL 0  (suites 68 · probes 66)
PASS  v5-institute-fixes.mutants.mjs  exit=0  480.6s  [shard=0/3]  ALL MUTANTS RED AS REQUIRED
PASS  v5-institute-fixes.mutants.mjs  exit=0  519.0s  [shard=1/3]  ALL MUTANTS RED AS REQUIRED
PASS  v5-institute-fixes.mutants.mjs  exit=0  466.4s  [shard=2/3]  ALL MUTANTS RED AS REQUIRED
```
- **S5 修复的独立确认** ✓✓：上一轮失败的 **`shard=0/3` 与 `shard=1/3` 本次都通过** ✓（且三片均**零重试** ✓）。
- **发布门禁（同一 HEAD ✓✓）**：`release-check` **ALL CHECKS PASSED** ✓（tarball sha1 `e6eefc44…` ✓、**300 文件** ✓、**294 文本文件无 CRLF** ✓）＋ `--self-test` ✓ ＋ 变异 **ALL MUTANTS RED AS REQUIRED** ✓ ＋ 跑完 `dirty=0` ✓。
- **一条新纪律（本轮用两次代价换来 ✓✗）**：**不要在自己还有验证作业在跑时启动全量扫掠** ✓ —— 本轮第一次启动 T3 时，预检因**我自己刚跑完的 shard-1／正控集**把机器打满而 FAIL ✗（**T3 从未开始** ✓，守卫有效 ✓）；空转后一次即全绿 ✓。同一课与 `run-tests.mjs` 自带的实测注释一致 ✓（`--concurrency=6` *"was RED with one 180 s TIMEOUT"* ✓、`--concurrency=4` *"faster but noisier"* ✓）⇒ **偶发是并发度的函数** ✓✓，默认 `concurrency=2` 已是保守选择 ✓；`--concurrency=1` 是**零代码成本**的附加证据路径 ✓（**规范验收仍是默认口径** ✓）。
- **S5 的第二次定点诊断（更精确 ✓✓）**：定向 `MUTANTS_ONLY='S5'` 也复现 ⇒ **不是纯负载** ✗；失败那一族的判定原文是 **`no named red (exit=1)`** ✓ 且该子进程跑了 **35 617 ms** ✓ ⇒ **既不是"等得不够久"** ✗，而是**变异把场景弄崩、却没有任何具名断言行** ✗ —— 与最初 `S25B` 的缺陷**同类（变异过宽）** ✓，**不是 vmu 缺陷** ✓。**据此登记为定点待办** ✓：把该族（`S5: the stalled path goes back to convening a meeting on its own (R1/D10)` ✓）的变异**收窄**，使其只造成**预期的那条具名红** ✓（同 `S25B` 的修法 ✓）；**不做**"把无断言的崩溃当红" ✗（那会掩盖过宽变异 ✓）。

**第 8 次 T3（2026-10-10 08:44–09:14，30 min，HEAD `1fe6ffc`，起点 `dirty=0`）—— 🎉 首次全绿 ✓✓**：
```
TOTAL 134  PASS 134  FAIL 0  (suites 68 · probes 66)
PASS  v5-institute-fixes.mutants.mjs  exit=0   488.0s  [shard=0/3]  ALL MUTANTS RED AS REQUIRED
PASS  v5-institute-fixes.mutants.mjs  exit=0   560.7s  [shard=1/3]  ALL MUTANTS RED AS REQUIRED
PASS  v5-institute-fixes.mutants.mjs  exit=0   472.1s  [shard=2/3]  ALL MUTANTS RED AS REQUIRED
```
- **拆分直接见效** ✓✓：三片分别 **488／560.7／472.1 s**（≈8–9 min ✓）⇒ 远低于任何上限 ✓，彻底摆脱"单片 25–35 min"的时序窄口 ✗✓；
- **旁证** ✓：第 7 次全量红掉的 `e2e-v4-fixes`（140/1 ✗）与 `e2e-v5-round2`（532/2 ✗）**本次自动转绿** ⇒ **证实它们同为负载所致** ✓（与我当时的判断一致 ✓）；
- **发布门禁（同一 HEAD 复跑 ✓✓）**：`release-check` **ALL CHECKS PASSED** ✓（tarball sha1 `8b087b89…` ✓、299 文件 ✓、**293 文本文件无 CRLF** ✓）＋ `--self-test` ✓ ＋ 变异 **ALL MUTANTS RED AS REQUIRED** ✓ ＋ 跑完 `dirty=0` ✓。
⇒ **目标⑤的"非增量 T3 ＋ 发布门禁"两项证据到齐** ✓✓。

**第 6／7 次 T3（2026-10-09／10，HEAD `fa997e3`／`fec4b30`）**：
| 次 | 结果 | 红点（**全部为遗留 v4/v5 端到端作业，vmu 范围零红** ✓） | 关键收获 |
|---|---|---|---|
| #6 | `131/132` ✗ | `v5-institute-fixes.mutants`（自报 **`families=167/168`** ✓ ⇒ **只有 1 个族失败** ✓，具名 `S25-B` ✗） | 具名判定行生效 ✓；**S25-B 定点诊断**完成 ✓（机制＝变异子进程 2 s 等待下限太短 ⇒ 负载下驱动循环走不到被变异步 ✗） |
| #7 | **`129/132`** ✗ | ① `e2e-v4-fixes`（**140/1** ✗）② `v5-institute-fixes.mutants`（**2130.2 s** ✗，自报 `family did not redden by name: S5: the stalled path goes…` ✓✓）③ `e2e-v5-round2`（**532/2** ✗） | ① **失败清单机制按设计工作** ✓✓（点名 `S5`，无需再猜 ✓）；② 本次主机**明显更慢**（该族 2130 s ≈ 35.5 min vs 标称 25 min ✗；`formal-verify-v4` 234 s vs 90 s ✗ ⇒ ~2.5× ✓）⇒ **负载是共同驱动因素** ✓ |

**结论（诚实 ✗）**：**目标⑤的"非增量全量全绿"在当前主机的负载下无法稳定取得** ✗ —— 七次全量里 **vmu 范围（T0／T1 49／文档 52／变异 15／发布门禁）始终全绿** ✓，红点**每次都落在遗留 v4/v5 端到端作业**上，且**每次都不同** ✓（S25B → S5 ＋ v4/v5 e2e ✗）⇒ 这不是"某处坏了"，而是**这批遗留 e2e 作业对负载的时序容限太窄** ✗。
**已批准的结构性修复（用户 2026-10-10 决定：先诊断、再拆分 ✓）**：把 `tests/v5-institute-fixes.mutants.mjs`（单作业 ≈25–35 min、168 族）**拆成 2–3 个作业** ✓；同时把 `e2e-v4-fixes`／`e2e-v5-round2` 的**负载敏感断言**按同一方法（具名诊断 ⇒ 精准加时/重试）逐条处理 ✓。**拆分会影响 `derived/shipped` 计数与 `AUDIT-CHECKLIST` ⇒ 必须同步重算** ✓。

**S25-B 的定点诊断（用户批准的"先诊断、再拆分" ✓，2026-10-09 完成 ✓✓）**：
- **现象**：第 6 次 T3 的**具名判定行**证明 `families=167/168` ✓ —— 唯一失败者是 **`S25-B`**（`track=rejected ⇒ 落 rejected.md` ✗），**其余 167 个族按名变红** ✓；该族与其子族在隔离下**全绿** ✓（`S25-B` 定向 **5 连跑 0 失败** ✓）。
- **机制（读码定位 ✓）**：`runFamily` 给**变异子进程**设 `E2E_V5_WAIT_FLOOR_MS: '2000'`（注释自陈"变异只需按名变红 ⇒ 用**小等待下限**" ✓）⇒ **负载下驱动循环可能在走到被变异的 `rejected` 轨道之前就结束** ✗ ⇒ 期望的具名红不出现 ⇒ 该族判失败 ✗✓（**根因是"等待下限太短"，不是产品行为** ✓）。
- **修法（精准且便宜 ✓）**：**只在失败时**用**更耐心的下限（`PATIENT_WAIT_FLOOR_MS = 8000`）重试该族一次** ✓（`RETRY family …` 打印注明这正是 S25-B 的诊断结论 ✓；重试仍不匹配照样计红 ✓）。**代价**：只在真失败时付 ~数秒 ✓，而不是让 168 个族各付 30 s ✗。
- **仍待办（用户已批准的方向 ✓）**：**把该族拆成 2–3 个作业**（结构根治 ✓：作业数 132→约 134 ⇒ 需重算 `derived/shipped` 计数与 `AUDIT-CHECKLIST` ✓）；拆分前先看第 7 次全量是否已转绿 ✓。

**第 5 次 T3（2026-10-09 01:07–01:40，33 min，HEAD `b12b49f`，起点 `dirty=0`）**：`TOTAL 132 PASS 131 FAIL 1` ✗ —— 该族 `1561.7 s` 红（**其余 131 作业全过** ✓）。**本轮最重要的发现是方法论级别的** ✗✓：
> **sweep 摘录里"看不到"≠"没有发生"** ✗✗ —— 我连续三次（T3-3/4/5）从日志里读"族没有打印汇总／没有重试行"，并据此推断"族静默死亡" ✗；查证 `tests/run-tests.mjs:547-550` 的 `failureDetail()` 后发现：它**优先只打印"具名断言行"**（最多 40 行 ✓），**汇总行会被过滤掉** ✗ ⇒ 我的读数**从一开始就不可靠** ✓。
> **修法（本轮 ✓）**：该族**总是打印一条具名判定行** ⇒ `FAIL|PASS v5-institute-fixes.mutants: families=X/Y positives=A/B retries={P positive, F family} crashes=C hangs=H skipped=S` ✓✓ —— 于是**下一次全量摘录必然携带真相** ✓（无需再花 26 分钟单独复现 ✓）。
> **同时修掉两个真 bug** ✓：① 判定行引用了只在非定向分支声明的 `LIST`／`retried` ⇒ **定向运行 `ReferenceError`** ✗ ⇒ 已把场景清单与计数器**上提到分支之外** ✓；② 之前"族崩溃⇒重试够不着"✗ ⇒ `safeRunFamily`（`crashCount++` ＋ `FAMILY CRASH` ✓）。
> **复验** ✓：五个定向族全绿并各自打印判定行 ✓（`S25B 2/2`／`S25A 4/4`／`S21 6/6`／`G2 1/1`／`S8 7/7` ✓）；两个自证 exit 0 ✓；`run-tests --self-check` 全过 ✓。
**由此又修两处（本轮 ✓）**：① `runFamily` 外层加 `safeRunFamily` —— **崩溃＝该族失败**（打印 `FAMILY CRASH <name> :: <msg>` ✓）⇒ 汇总**必然打印**、重试**必然生效** ✓；② **估时按四次实测校正** ✓：`DURATION_WEIGHTS['v5-institute-fixes.mutants.mjs']` 由 **906.9 s → 1800 s**（实测 1483.6／1509.9／1981.6 s ＋ 历史 1319–1456 s ✓；旧值低报 ~2× 会**错排 headstart 窗口** ✓）。**验收依据仍是下一次 T3** ✓。

**发布门禁（机器面，2026-10-09 第三次实跑 ✓✓）**：
| 项 | 结果 |
|---|---|
| `node scripts/release-check.mjs` | **ALL CHECKS PASSED** ✓（tarball sha1 `9c62cf32…` ✓、**299 文件** ✓、**293 文本文件无 CRLF** ✓） |
| `node scripts/release-check.mjs --self-test` | 全过 ✓ |
| `node tests/release-check.mutants.mjs` | `ALL MUTANTS RED AS REQUIRED` ✓ ＋ 对照绿 ✓ |

> **发布本身（版本号 ＋ `npm publish` ＋ GitHub Release）**：**未做** ✗ —— 属"**较大影响决策**" ✓，须由用户批准 ✓（§7 的"发布前把草稿交用户确认" ✓）。门禁的**机器面已全绿** ✓。

**该红的定位（本轮已完成 ✓）**：红不是 v5 行为缺陷 ✗，而是**变异族自身的漂移** ✗✓ ——
- 被判红的断言来自 **`tests/selfdrive-v5.mjs:2782-2791`**（`s25b-progress-tracks` 场景 ✓），而该套件在**同一轮 T3 里 PASS** ✓（`ALL GREEN` ✓）⇒ **基线绿、仅变异下红** ✓；
- 变异 `S25B: the track resolver hard-codes narrative`（`v5-institute-fixes.mutants.mjs:1664-1672` ✓）把 track 解析**写死成 narrative** ⇒ **同时**打断 `rejected` 与 `obstacle` 两条落盘断言 ✗，而该族要求"**单点必红**" ✓ ⇒ 期望模式（只匹配 `rejected ⇒ rejected.md`）**过窄** ✗；
- ⇒ 处置：**测试侧**收窄变异（只写死 `rejected` 分支 ✓）或放宽期望（接受任一被打破的落盘断言 ✓），**不动 v5 行为** ✓（"守卫要能失败"与"变异要单点"两条同时满足 ✓）。

> **纪律收获（第三次同类 ✓）**：**变异锚点/期望会随被测代码漂移而腐化** ✗✓（本会话已三次：我自己的 stale `--self-probe` 锚 ✓、M1 删除不存在的文档 ✗、以及本条 ✓）⇒ 变异族必须把**锚点命中**本身作为断言 ✓（`indexOf(anchor) === -1 ⇒ 立即红` ✓），并在**每次 T3** 里被真正跑到 ✓✓ —— 这正是"T3 每 2–3 期集一次"不可被省掉的原因 ✓。

**该红的修复（已落地 ✓，只动测试 ✓）**：该守卫此后长成**五条**断言（缺省／`rejected`／`obstacle`／非法具名拒／回到缺省 ✓），而原变异把解析**整体**写死 ⇒ **同时打断多条** ✗，违背本族"**单点必红**" ✓。⇒ 把变异**收窄为"只把 `rejected` 走错档"** ✓（`const T = (String(track) === 'rejected') ? 'narrative' : …` ✓），使失败恰好落在期望的那条 ✓✓。
**定向验证**（`MUTANTS_ONLY='S25B'` ✓；该模式**自我标注"DIRECTED、非全量证据"** ✓）：`2/2 具名红` ＋ `ALL MUTANTS RED AS REQUIRED`，**4 s** ✓；红文与 `expect` **逐字相符** ✓。**全量 T3 将在下一轮跑一次收尾确认** ✓。

---

### 9.8 实现阶段进度（**活文档** ✗✓）

> 设计阶段的产物已经够多（**23 卷**；**959 个设置键里只有 51 个有消费者** ✗）⇒ 从本轮起按 `14-§4` 的分批计划**开始实现** ✓；本节逐轮回写"哪些计划真的落地了" ✗✓ —— 判据是**代码＋测试**，不是文档承诺 ✗。

| 批／切片 | 范围 | 规格来源 | 代码 | 测试 | 状态 |
|---|---|---|---|---|---|
| 批 1 · 切片 1 | 议程＋动议 | `08-§2`／`08-§10`／`08-§13` | `kernel/governance.js` | `tests/vmu-governance.test.mjs` | **已实现 ✓**（9/0 ✓） |
| 批 1 · 切片 2 | 看板／WIP／泳道／老化 | `08-§4`／`08-§10`／`08-§12` | `kernel/board.js` | `tests/vmu-board.test.mjs` | **已实现 ✓**（43/0 ✓；`VMU_WORKFLOW_TRANSITION_REQUIRED` 已登记 ✓） |
| 批 1 · 切片 3 | 会议纪要／决议／行动项 | `08-§2`／`08-§10`／`08-§12` | `kernel/minutes.js` | `tests/vmu-minutes.test.mjs` | **已实现 ✓**（20/0 ✓；实现中自查修掉一个上限比较 bug ✓） |
| 批 1 · 切片 6 | 审计（只追加/入库前脱敏/写失败具名） | `21-§2`／`07-§4.9`／`20-§6` | `kernel/audit.js` | `tests/vmu-audit.test.mjs` | **已实现 ✓**（22/0 ✓；复用内核既有落盘接缝 `auditToDisk` ✓） |
| 批 1 · 切片 7 | 告警与 SLO（告警级去重/静默补摘要/三值） | `21-§5`／`21-§13`／`21-§14` | `kernel/alerts.js` | `tests/vmu-alerts.test.mjs` | **已实现 ✓**（57/0 ✓；与 17 卷通知面**分层**：指纹＝指标×对象×码 ✓） |
| 批 1 · 切片 8 | 保留/回收站/配额/GC | `07-§4.3`／`07-§4.4`／`07-§4.8` | `kernel/retention.js` | `tests/vmu-retention.test.mjs` | **已实现 ✓**（55/0 ✓；**默认只报告** ✗，动手须显式 `dryRun:false` ✓） |
| 批 2 · 切片 1 | 委托与转委（**S-2 只减权**） | `17-§4`／`17-§20` | `kernel/delegation.js` | `tests/vmu-delegation.test.mjs` | **已实现 ✓**（107/0 ✓；越权**点名越出项** ✓，零机制下**不假装已授权** ✗✓） |
| 批 2 · 切片 2 | 信任与声誉（**S-3**：声誉绝不授权） | `17-§5` | `kernel/trust.js` | `tests/vmu-trust.test.mjs` | **已实现 ✓**（47/0 ✓；`authorityFrom()` **永远具名拒** ✓；零机制返回"无数据"而非 0 ✓） |
| 批 2 · 切片 3 | 仲裁（回避/理由/效力显式） | `17-§6` | `kernel/arbitration.js` | `tests/vmu-arbitration.test.mjs` | **已实现 ✓**（108/0 ✓；当事人任仲裁**点名拒** ✓；非约束性**自曝"仅有建议效力"** ✓） |
| 批 2 · 切片 4 | 交接（点名缺字段/压缩报丢弃） | `17-§11` | `kernel/handover.js` | `tests/vmu-handover.test.mjs` | **已实现 ✓**（21/0 ✓；**未接受的交接绝不算完成** ✗✓） |
| 批 2 · 切片 5 起 | 招募／拓扑／宪章／公平／技能／记忆／竞标 | `17-§7`／`17-§10`／`17-§14`／`17-§15`／`17-§17` | `recruit`／`topology`／`fairness`／`charter`（**已实现 ✓**：25/0／53/0／23/0／125/0 ✓）；`memory`／`bidding`（**已实现 ✓**：113/0／55/0 ✓）；`skills`（**测试红，未提交** ✗） | 同名测试 ✓ | **大部分已实现 ✓** |
| 批 3 | 归档落盘适配／复现包 | `07`／`16` | — | — | **未开始** ✗ |
| 批 4–5 | 计算与形式化／合规运营 | `09·15`／`16·20·22` | — | — | **未开始** ✗ |

> **本阶段累计** ✓：内核**已注册服务面 49 个** ＋ **T1 102/102**（第 24 轮实测 ✓，**在"全员空闲 ＋ 树干净"时付** ✓ —— 这是纪律：我曾错在队友写入中途跑，84/93 全是**在途集成缺口**而非回归 ✓）、**设置表已接线键 51 → 600+ / 1238** ✓（**具体数字永远以 `00-§3.2` 的生成索引为准** ✗✓）；**每一块都附"未做清单" ✗**。
> **本阶段最硬的两条纪律（都被真实缺陷逼出来 ✓✓）**：**①"读了键"与"键起了作用"必须可区分** ✗✓（回执带 **`enforced[]`** 只列本次真求值者 ✓；**拒绝路径也必须携带**（数组、可空、**不得 `undefined`** ✓✓）；`records` 还分出 **`fired[]`**＝真正改变结果的键 ✓ 并断言 **`fired ⊆ enforced`** ✓；未接键在 `status().plannedKeys` 里逐个点名＋原因 ✓，且断言 **`plannedKeys ∩ wired = ∅` 且恰好划分该族** ✓）。**②"接线上线 ≠ 机制生效"** ✗✓✓（**必须在有调用点、可观测影响、对照或反证三样齐备时才算完成** ✓）。
> **②这条纪律的三次实例（同一件事被连续抓到三次 ✓✓）**：**时钟守卫**（模块写完、测试绿，却**没有任何 TTL 敏感服务用它** ⇒ 回拨仍能复活过期条目 ✓ ⇒ 修到 **10 个服务**并加**无守卫对照组** ✓）；**审计锚点**（seam 接好、回执也对，但**全仓 `checkpoint()` 调用点 ＝ 0** ⇒ 锚点文件**永不写入**、防删尾**仍在睡觉** ✓✓ ⇒ 输入**非零默认节奏**＋`auditVerify()` **真用锚点**＋显式 `auditCheckpoint()`；我自己的探针在修的过程中**又两次**发现"传了参数却不生效"（模块读**设置属性**、且是**字面量键** ✓））；**`enforced[]`**（自称"可审计的接线证明"，但**恰在拒绝时 `enforced:null`** ✓、且 13 个键**变了却没列** ✓ ⇒ 已修 ✓）。
>
> ## ★ 本阶段的**核心纪律**：**"声明"必须指名两样东西** ✗✓✓
> **独立复核用一条系统性扫描（取 `kernel` 面 86 个成员，比对生产 vs 测试引用）连续抓到 _十_ 例同构缺陷** ✓✓，并在第 20 轮（里程碑）给出这一句话概括：
> > **这十例是同一个失效结构：某项能力／契约／守卫／生成物被"声明并接线"了，但它的执行点——运行时真正读它的那个调用点，或"通不过就红"的那道门禁——不存在、或不走——于是它只在纸上生效。**
>
> **可操作判据（新增声明时必须逐条回答）** ✗✓：
> 1. **生产调用点**：运行时**真的会调用它**的位置在哪里（给出文件:行 ✓）？
> 2. **会红的门禁**：**不通过就红**的那条断言／门禁是哪一条（不是"会被报出"就算过 ✗✓）？
> 3. 以上**缺任何一样** ⇒ **必须在 `status()` 与文档里显式登记为「诊断面」或「待办」并计数** ✓✓（**绝不允许"纸面生效"** ✗✓）。

> **④ ★★ 族提及不是键**（**轮 224 实测的注册表缺陷，代价 111 个幽灵键** ✗✓）：散文里写 `vmu.records.body.*` 是**对一个族的提及** ✓，**不是对某个键的声明** ✗✓。
> **失效结构**：键的正则**止于词边界** ✓ ⇒ `vmu.records.body.*` 被匹配成 **`vmu.records.body`** ✗ ⇒ 若尾随通配的判据只**向后看一个字符** ✗，它看到的是 **`.`** 而非 `*` ✓ ⇒ **判据永不触发，命名空间被铸成设置** ✗✓。
> **可操作判据（新增声明或写文档时逐条回答）** ✓✓：**① 这个点分名是否真的是键**——去 `settings/schema.js` 找**完全同名**的条目 ✓，找不到就是**族提及** ✗，**不得**进注册表 ✓；**② 尾随通配的判据必须【跨过可选的点】再找 `*`／`…`** ✓；**③ 命名空间的判据必须用【core ∪ planned 全集】** ✓（**只看 planned 集会漏掉子键是手写核心键的情形** ✗✓）；**④ 账本／变更记录不是设计卷** ✓——**它引用键名而不声明键** ✗✓，**不得**作为声明来源，**也不得**被要求每个提及名都已登记 ✓。
> **为何要写成纪律**：这四个坑**在同一轮内**分别由生成器、三个扫描器与我自己写的账本文本触发 ✓✓，**每个都只在实跑时显形** ✓（**纸面看不出** ✗）。
>
> **⑤ ★★ 临时脚本必须先语法自检再执行**（**轮 241 实测：同一个失败连续发生九次，其中一次让提交信息描述了【从未落地的工作】** ✗✓）：**从 PowerShell 附近拼出的字符串里夹一个 ASCII 引号或撇号，脚本会在【解析期即死】** ✓ —— **它什么都不做，却看起来像跑过了** ✗✓。
> **可操作做法** ✓：**一切临时脚本都经 `node scripts/dev/run-checked.mjs <脚本>` 执行** ✓ —— **它先 `node --check`，不通过就【拒跑并 exit 3】、并点名失败类别；通过才在子进程里跑，目标退出码即包装器退出码** ✓✓。**双向自证已入账**（**故意坏的脚本被拒、好脚本放行** ✓）。
> **根因值得记**：**我此前对【源文件】做语法自检，却从不检查【自己写的临时脚本】** ✗ —— **纪律的边界必须覆盖自己动手的那部分** ✓。
>
> **⑦ ★★ 止于【行中】的锚点会劈开这一行**（**轮 245 实测：`schema.js` 因此语法错** ✗✓）：**锚点写成 `… who: 'office',`（该行 `doc` 里还有内容）而替换文本含换行 ⇒ 插入后【前缀留下、我的行跟上、该行余下部分被孤立】** ✓ ⇒ **文件坏掉** ✓。**可操作做法** ✓：**插入一律用【按行定位】的 `insertAfterLine`／`insertBeforeLine`**（`scripts/dev/edit-positional.mjs` ✓），**并在写入前核对"文件行数增量恰等于块长"** ✓✓ —— **截断式编辑（曾毁掉一个测试套件）由此在原理上不可能** ✓；**谓词匹配多于一行也抛错** ✓。
>
> **⑧ ★★★ 静态计数不等于执行；先读该套件【自己的计数约定】**（**轮 246 实测：我为此毁掉过整个套件** ✗✓）：**该套件的约定是【每个测试体末尾 `passed += 1`】** ✓ ⇒ **我插入的测试【一直在跑并通过】，只因没有自增，计数停在原值** ✗ ⇒ **我却把「计数没变」读成「从未执行」** ✗，**并动用了会截断文件的编辑去「修」这个假象** ✓。**可操作判据** ✓：**看到计数不变，先读该套件的 runner 与 `passed` 的写法**（**`grep -n "passed += 1"` 与 `for (const c of cases)`** ✓），**再判定是否真的没执行** ✓✓；**「没跑到」与「跑到了但没计数」是两种完全不同的故障** ✓。
>
> **⑥ ★★★ 未生效的改写是【失败】，不是一句提示**（**轮 242–244 实测，代价整整两轮** ✗✓）：**轮 242 里那段术语校验的插入锚点没匹配** ✗ ⇒ **脚本打印了一行 `SKIP (n=0)` 就继续** ✓ ⇒ **代码【从未存在** ⇒ **`loaded` 恒为 false** ✗。**我却把这个"不存在"误诊为"实现失败"** ✗，**于是回退、又重写一遍同样的、仍然不会插入的代码** ✓ ⇒ **两轮都花在一个从未落地的块上** ✓✓。
>
> **⑭ ★★★ 码必须先【出现在文档里】才能被登记**（**轮 268 实测：一个码被码表拒收，另一个却早被接受** ✗✓）：**`generate-planned-codes.mjs` 的登记来源只有两处** ✓ —— **① 文档点名的码（`docs/03` 的生成块由它派生 ✓）；② `docs/03` 手写表【第一列】的反引号码 ✓**（**族前缀（尾部 `_`）跳过 ✓；手写区已有的不重复 ✓**）。**实测差异** ✓：**`VMU_RECRUIT_NEEDS_HUMAN` 早在生成块里作为"规划码"出现**（**由某卷点名 ⇒ 生成器认它 ✓**），**同批另一个码两处都没有 ⇒ 被拒** ✗。
> **⑳ ★★★ 删一个【族】不能按文件删，必须按族逐一枚举触点**（**轮 301 实测** ✗✓）：**撤 `custody` 时共 15 处触点**（内核面／`schema.js` 行／`index.js` 的 import＋构造＋**聚合解构表成员**＋`registry.register`＋getter／`package.json` ＋ `installer.js` 双清单／零机制矩阵生成器／服务审计映射／`03` 的码表行／卷内设置表与章节／生成物／台账）✓。★★ **两处最危险的耦合点**：**① 共享套件** —— 那个测试文件**同时覆盖三个族**（被撤的 ＋ `budget` ＋ `audit`），**按文件删会静默丢掉两个保留族的 30 条断言** ✗ ⇒ **必须拆套件**（拆后实测 30/0 全绿 ✓）；**② 聚合解构表** —— 我把 `discipline, custody, explain` **整段删掉**，**连带移除两个活着的服务** ✗ ⇒ **语法检查当场拦下**，修复后**实证**内核 104 服务且两个服务都在 ✓。**可操作做法** ✓：**先 `git grep -c` 取全触点清单再动手**；**共享套件一律"拆"不"删"**；**聚合表只改成员、不删整段，并断言修复结果**；**撤完必须 `node --check` ＋ 载入内核点数服务** ✓。
>
> **㉘ ★★★ 在 docs 里写"面.操作"时，【必须把面和操作分开写】**（**轮 338 实测** ✗✓）：**把 `把 records 面的 put 操作` 这类【面.操作】照连字形式写进文档** ⇒ ★ **planned-settings 生成器会把它当成【设置键**】✓ ⇒ **`settings/planned.js` 多出键** ⇒ **maturity 表漂移**（`vmu.records 32/33`、`vmu.tasks 3/4` ✓）**且 meetings 的"声明键宇宙"断言变红** ✗。**可操作做法** ✓：**面写 `vmu.records`、操作写 `put`，或写 `records.put()`** ✓；**只有真正的设置键才用三段点号** ✓。★ **判别法：凡该三段名在 `settings/schema.js` 里不存在，就说明它是面.操作、不是键** ✓。
>
> **㉗ ★★ 给宿主接缝写文件解析时，必须区分【相对路径】与【已绝对的路径】**（**轮 328 实测** ✗✓）：**预设把已经绝对的 `instRoot()` 交回接缝**，而我的 `resolve` **无条件** `join(workspace, p)` ✗ ⇒ **路径被拼坏** ⇒ ★ **每一步落盘都静默失败**（`record_proposition`／`lean_archive` 全返回空对象 ✗），**而"纯逻辑"的步骤却照样通过** ✓ —— **症状极具误导性：看起来像"机制不可达"，其实是"路径不可写"** ✓✓。**可操作做法** ✓：**① 接缝的路径解析先判"是否已绝对"（尤其 Windows 的 `X:\` 与 POSIX 的 `/` ✓），绝对的【原样透传**】✓；**② 落盘失败时，先怀疑路径，再怀疑机制** ✓；**③ 断言里保留原始返回体**（本轮靠 `{}` 这个空对象才定位到 ✓）。
>
> **㉖ ★★ 用"吞掉块首行"的方式插入代码块，会把块首一起吃掉**（**轮 320–322 连犯三次** ✗✓）：我把新块插在某段之前时，`old_string` 用了**那段自己的开头两行**（`{` ＋ `mark(...)`）✗ ⇒ **替换后块首消失**，剩余内容成了**裸表达式**，直到 `node --check` 报 `} (motion -> ...` 才暴露 ✓。**可操作做法** ✓：**① 插入用【独立且唯一的一行注释】作锚**（如 `// ── 6. ...` 这种标记行 ✓），**不要用被插入块自身的首行** ✗；**② 若锚必须是块首，就在 `new_string` 里【原样重抄】那段首行** ✓；**③ 每次编辑后立刻 `node --check`** ✓ —— **本轮三次都是靠它立刻发现** ✓。
>
> **㉕ ★★★ "能开会"不等于"能投票"：同一工具族内【各操作的身份要求不同】**（**轮 312 实测** ✗✓）：**补上宿主 `fs` 接缝（`resolve`／`stat`／`readText`／`writeText`）与 `ctx.timeout` 后，`vibe_v5_start` 与 `vibe_v5_meeting` 都能真跑** ✓✓；**但 `motion`／`poll_*` 全部返回 `V5_MEMBER_NOT_FOUND "office"`** ✗ —— 因为**该预设是"执行体绑定"的**：`currentMember` 只在**调度器真正启动某成员回合**时赋值 ✗。**可操作做法** ✓：**① 判"驱动可行性"必须【按操作】判，不能按【族】判** ✗（开会走所办路径 ✓、投票要求在册成员 ✗）；**② 遇到"要不要身份"，先查它是【从调用者推】还是【从调度器取】** ✓ —— **后者无法用夹具伪造，只能真跑回合或改用重驱动** ✓。
>
> **㉔ ★★★ 轻量假 ctx 能驱动【工具本体】，但驱动不了【带写入-回读校验的状态机】**（**轮 311 实测** ✗✓）：**用假 fs 调 `apply()` 后，v5r 的会议家族 13 个工具都能真跑** ✓（**参数 schema 与拒绝码都取得到** ✓）；**但 `vibe_v5_start` 之后它写 `institute.v5state.json` 并【回读校验】** ✗ ⇒ **假 fs 被判 "the in-memory state advanced but the file is STALE"，后续一切（开会／开票／关票）都不可信** ✓。**可操作做法** ✓：**① 先用"工具本体能否注册与调用"判定驱动可行性**，**再用"状态机是否写入-回读"判定【多步流程】可行性**（两者不是一回事 ✗）；**② 要让多步流程可跑，须提供语义等价的文件后备接缝，或改用重驱动**（真 CLI ＋ 隔离 profile ＋ provider ✓）；**③ 若两者都不可得，就如实记为"未对照＋技术原因"** ✓ —— **"缺接缝"与"没做"必须分开写** ✗✓。
>
> **㉓ ★★★ "某一个面的方法表"不等于"能力面"**（**轮 309→310 实测** ✗✓）：**我据 `meetings.js` 的方法表断言"vmu 没有附议（`second`）"并记为缺口候选** ✗ —— **实测：附议住在邻面 `governance.js`** ✓（**`vmu.motions.secondThreshold` 已接线** ✓＋**`VMU_MOTION_NOT_SECONDED` 已实现** ✓＋`docs/08` 的 `seconders[]`／`state.seconded` ✓）⇒ **误报缺口** ✗✗。**可操作做法** ✓：**判"有没有"之前，先按【概念词】全仓查（`git grep -i`），而不是只查你正在读的那个文件** ✓；**尤其注意 `motions`／`governance`／`ballot`／`ballotbox` 这类【同域邻面】** ✓（本仓一个能力常由一个面实现、另一个面记账 ✗）。★ **这条与"否决子串映射"同因**：**都是"没查全就断言"** ✗✓。
>
> **㉒ ★★★ 改名时【不要替换裸词】**（**轮 308 实测** ✗✓）：**把 `sample` 整词替换成 `entry` 时，误伤了无关的标识符** ✗ —— `vmu.metrics.`**`sampleHighVolume`**／**`sampleRate`** 被改成 `entryHighVolume`／`entryRate` ✗ ⇒ **生成器随即把【原键】重新登记**，于是同一语义出现**两行**，**未接线计数 +2**（92 → 94）✓。**危害是"看起来都对"**：语法绿、门禁绿，**只有成熟度/计数审计把差值暴露出来** ✓✓。**可操作做法** ✓：**① 只替换【限定名**（带族前缀的 `vmu.<family>.<key>`，或确切列出的键名表）**✗；② 若确需替换裸词，先 `git grep -c` 列出**它出现的每一处**并逐条判定** ✓；③ 改完**对比生成物**（`git diff` 生成表/注册表）**，让"多出来的行"自己现身 ✓**。
>
> **㉑ ★★★ 在 Windows 上从 git 历史取文件时，【修订号必须加引号】**（**轮 305 实测** ✗✓）：**Node 的 `execSync` 走 `cmd.exe`，而 `cmd` 把 `^` 当转义符** ✗ ⇒ 把 `git show <sha>^:<path>` 直接拼进命令行时，`^` 会被吞掉，**报错却是 "path does not exist in `<sha>`"** —— **看起来像"文件不存在"，其实是"修订号被改了"** ✗✓。**正确做法** ✓：把 `<sha>:<path>` 整段加双引号再交给 `git`。★ **同类**：`^`／`&`／`|`／`>` 在 `cmd` 里都不是普通字符 ⇒ **凡把 git 修订表达式拼进 shell 字符串，一律加引号** ✓。
>
>
> **⑲ ★★★ 新交付文件必须【双登记】**（**轮 277／299 两次实测** ✗✓）：**`package.json` 的 `files` 与 `installer.js` 的 `PRESETS.*.files` 是两份独立清单**，**只登记一处会让两个审计分别变红** —— `audit-package-membership`（"every design volume on disk is listed"）与 `audit-installer-policy`（"every shipped file is managed or explicitly exempt"）✗✓。★ **典型表现**：T1 报出**名字很像的两条**失败，人容易只修一条；**正确做法＝一次把两份清单都改** ✓。
>
> **⑱ ★★★ 凡"扫描到某个收尾模式为止"的循环，必须先断言【它真的找到了】**（**轮 291 实测** ✗✓）：**我写了个 `while` 去找参数表的闭括号，模式【不匹配】** ✗ ⇒ **循环一路跑到文件末尾（`end` 停在 697 行 ✗）** ⇒ **脚本在【打印**时崩掉、**`writeFileSync` 尚未执行** ✓ ⇒ **该次没有写入** ✓。★ **损害取决于【其后的代码**：若打印在前，就是"白跑一趟"；若写在先，就是"把一个从 512 到 697 的巨大区间整体替换掉"** ✗**）** ✓。**可操作做法** ✓：**① 循环后立刻断言 `found`，否则 `throw`（本仓的 `anchored`／`insertAfterLine` 正是这个形状 ✓）；② 修改类脚本把【日志】放在【写盘】之后，或至少让写盘成为最后一步 ✓；③ 大文件里**宁可用单行锚点，也不要自己扫括号** ✓**（本轮改用单行锚点后一次成功 ✓）。
>
> **⑰ ★★★ PowerShell 管道抓取 Node 的 stderr 会【伪造出像错误的输出】**（**轮 284–285 实测** ✗✓）：**用 `node x.mjs 2>&1 | Select-Object` 抓取时，输出里出现了 `requireStack: []` 与 `RemoteException`** ✗ —— **看起来像"模块找不到"，而我差点据此认为审计坏了** ✓。**改用【重定向到文件】（`Start-Process -RedirectStandardError`）复测** ✓：**exit 0 ✓、stderr 【完全为空** ✓、stdout 为 `=== CROSS-VOLUME REFS: 745 reference(s) checked, 0 unresolved ===`** ✓ ⇒ **审计一直是好的，伪影是我自己造的** ✓✓。
> **可操作做法** ✓：**① 要【定论】时，把子进程的输出重定向到文件，再读文件 ✓**（**管道抓取会把手性与 stderr 混在一起 ✓**）；**② 看到"Node 报错"字样时，先确认它的来源是【子进程】还是【外层 shell】** ✓；**③ 与 `docs/11` 第 ⑥ 条（"未生效的改写是失败"）合看** ✓——**那条讲"别把未发生的事当成发生了"，这条讲"别把没发生的事当成发生了"** ✓。
>
> **⑯ ★★★ 两套来源要用【并集】，不能用【互斥备选】**（**轮 281 实测：一个生成器因此看不见三条真实的键** ✗✓）：**`generate-wired-schema.mjs` 的头注释自己写着"代码读到的键【就是】已接线的，登记必须如实"** ✓，**而它的循环写的是 `const keys = listed.length ? listed : readKeysOf(src)`** ✗ ⇒ ★★ **"有导出清单就【不再看读取"** ⇒ **凡导出了键表的模块，其余读取一律被忽略** ✗**）** ✓。**实测代价** ✓：**`records.js` 导出 24 条、另读 3 条** ⇒ **一条留在计划登记里、而生成表同时标它已接线（自相矛盾的一行 ✓），另外两条【只因为三轮前被手工写入】才进得了核心表** ✗。**修法** ✓：**两处（发出循环 ＋ 不变量检查）都改成并集** ✓；**效果精确到一条** ✓（**24 → 25；发出总数 332 → 333；核心表 1338 → 1339 行；其余全不变 ✓**）。
> **可操作做法** ✓：**① 任何"多来源合并出结论"的地方，先问【是并集还是备选】** ✓；**② 改这类生成器前先量【影响面】再提交** ✓（**本轮并集只多一条键；若多出几十条就必须先看清单** ✓）；**③ 为它配一道守卫** ✓ —— **`tests/audit-vmu-wired-union.test.mjs`（轮 282）直接调该生成器导出的 `collect()`，断言"凡导出了键表的模块（实测 18 个），其【只读键】也必须被发出"** ✓，**并自证不会空过** ✓。
> **方法论** ✓：**这次调查【三次改变对根因的判断】** ✓（**先怪编辑工具 ⇒ 怪读取形态 ⇒ 最后是那一行三元表达式** ✓）—— ★ **而每一次，量一下都比它取代的那场论证更便宜** ✓。**推论** ✓：**遇到"报告成功却无效果"，不要先怀疑工具** ✓：**先用 `git log -S` 看它是否【曾经存在过】** ✓（**本轮因此立刻排除了"工具说谎"** ✓）。
>
> **可操作做法** ✓：**① 新增一个会抛出的码时，先把它写进【它所属的卷】或【`docs/03` 的手写表】✓（手写行形状：`| \`码\` | 说明（含"实现于 kernel/x.js ✓"） | 族 | 判据 |` ✓）；② 再跑生成器 ✓；③ 实现状态是【派生】的，不要手打 ✓**。★ **反面代价** ✓：**本轮我一度因为"登记不进去"而把一个**真正的拒绝**降级为"回执里报出"** ✗ —— **那是【绕开登记】而不是【解决登记】** ✓；**查清机制后升回抛出才对** ✓。> **⑭ 补注（轮 269／270 实测，★ 关键）** ✓✓：**登记与判据【必须同改】——单改一处会把门禁弄红** ✗。**实测**：给生成器加了"后随 `(` 即调用"的规则后，**5 个幽灵键从 `planned.js` 消失** ✓，**但 `audit-vmu-docs` 立刻报"文档点名的键必须在 settings 里存在"** ✗ —— **因为该审计的判据也在做同样的混淆** ✓。★★ **正解＝照【先例】修** ✓：**该审计早已为同一类问题立过规矩** ✓（**`NON_SETTING` 里的 `vmu.ip.*` 五个服务面，注释写着 "Dotted like keys, but no pack can tune a method name"** ✓）⇒ **把新发现的五个名字【同时】加进审计与生成器的 `NON_SETTING`** ✓ ⇒ **一次改动、三处审计全绿** ✓。★ **教训** ✓：**① 动手前先量"判据点"有几处** ✓（**同一不变量的判据往往有多个副本 ✓**）；**② 有先例就照先例，别自创更通用的规则** ✓；**③ 剔除幽灵键后要复核【已接线的邻居仍在】** ✓ —— **那才是"删的是错误、不是真缺口"的证据** ✓。> **⑮ ★★★ 接线记账是【按族】的 —— 跨族接线要【新建该族的面】**（**轮 275 实测：实现写通并逐支验证，却因记账规则整体回退** ✗✓）：**某一族的键表断言【恰好是本族那些键】✓，并要求【本族套件确实读过每一条】** ✓。**实测** ★ **`funding.js` 的 `WIRED_KEYS` 断言 16 条 `vmu.funding.*`，而套件的第三条把规则说得最清楚** ✓：**"every wired key was really READ by the suite, not merely listed"** ✓ ⇒ **把 `vmu.partnership.*` 六条塞进那张表 ⇒ 三条断言全红** ✓。
> **可操作做法** ✓：**① 跨族键 ⇒ 新建该族自己的面** ✓（**用它的键表、它自己的套件** ✓）；**② 动手前【量该族的记账表与它的断言】，而不只量键的语义** ✓；**③ 新面要接的【五处】已量清** ✓（**`kernel/index.js` 四处：import ＋ create ＋ `registry.register(name, {apiVersion:1}, {kind:'service', description})` ＋ getter ✓；`package.json#files` 一条 ✓；`tests/audit-vmu-services.test.mjs` 的 SURFACES 一条 ✓；`scripts/generate-zero-mechanism-matrix.mjs` 的逐面裁定一行 ✓**）—— **轮 276 照此清单一次接通，服务审计由 68 升至 69 ✓**。
> **另一条并存约定** ✓：**新面的拒法有两种先例** —— **`publication.js` 的 `refuse` 【抛出】✓，`funding.js` 的 `deny` 【返回】** ✓ ⇒ **新面应先量【最近的前例】，再写测试** ✓（**轮 276 我按"抛出"写了五条断言，而该面跟随 `funding` 的"返回"，五条全红 ⇒ 是【测试】错，不是面错** ✓）。，先找【它的来源清单】，再决定是补来源还是改设计** ✓。
>
> **⑬ ★★★ 更正一条声明，就要【改掉那条声明】——只加一句"更正说明"不算更正**（**轮 264／265 实测：卷 22 是反例** ✗✓）：**该卷 L85 早已写着"状态更正（轮 61 核实）：以下各条的'计划 ✗'字样已过期"** ✓ —— **而它下面 5 处"计划 ✗"** 【一处都没改** ✗**）** ✓；**轮 265 逐族实测后更发现：该卷点名的 22 个键族里【14 个已全部接线**（含 `resource` 17/17 ✓、`funding` 16/16 ✓、`custody` 7/7 ✓、`capacity` 12/12 ✓、`conference` 18/18 ✓、`hr` 11/11 ✓、`ip` 15/15 ✓、`records` 32/32 ✓ **）**）** ✗ ⇒ **而卷里仍称这些服务"未实现"** ✓。
> **可操作做法** ✓：**① 更正时【同时】改掉被更正的那句** ✓（**保留原句仅作对照时，必须【就地标注"已过期"**，而不是只在别处加一段说明 ✓**）**；**② 涉及"实现到什么程度"的声明，一律用【实测表】而不是形容词** ✓（**本轮的做法：逐族列出"键数／已接线／读取者／裁定" ✓**）；**③ 表里的判据必须可复算** ✓（**本轮＝`docs/04` 的设置表 ＋ 内核扫描 ✓**）。★ **理由**：**读者只看那句声明本身** ✓ —— **一段远处的更正无法阻止它继续误导** ✓。
>
> **⑫ ★★★ 如何【退役】一个键：三处同时认可，且【点名只放台账】**（**轮 258–260 三轮换来** ✗✓）：**发现一个键是重复声明（"一个语义两个名字"）后** ✓，**直接删声明会【连红三处审计** ✗**）** —— **因为 `audit-vmu-docs` 有一条【正确的不变式】："文档里点名的每个 `vmu.*` 键都必须存在于设置中"** ✓。**而该审计【自己文档里】早就写明了豁免** ✓：**前缀属于台账的卷【直接跳过**（"台账既不声明键，也不因提及名字而产生登记义务" ✓）**）**，**生成器也跳过 `14-`** ✓ ⇒ ★★★ **因此退役只需三件事，且【审计一个字都不用改】** ✓✓：
> **① 生成器**：**把"退役行"视为【记录】而非【声明】** ✓ —— **`RETIREMENT_RE` ＋ **按【整行】判定**（不是字符窗口 ✓；轮 259 实测：窗口版无效、按行版一次成功 ✓）；** ② 设计卷**：**删除声明【且不再点名该键】** ✓，**只留结论与"存活键是哪一条"** ✓；** ③ 台账（`14` 卷）**：**键名＋理由＋存活键＋退役动作** ✓ —— **因为【只有台账既能点名、又不会被重新登记】✓**。**可判定判据** ✓：**退役后，`planned.js` 里该键 0 处 ✓、设置表里 0 行 ✓、非台账卷里 0 次点名 ✓、台账里有记录 ✓**，**且 `audit-vmu-docs`／`vmu-planned-settings` 仍全绿** ✓✓（**轮 260 实测：四项判据全部成立 ✓**）。
> **失败过的两种做法** ✗：**(a) 只改生成器、卷里继续点名** ⇒ **`audit-vmu-docs` 红** ✓；**(b) 为了能点名而去削弱那条审计** ⇒ **削弱一条【在守护真实不变式】的审计，是拿掉护栏而不是解决问题** ✗✓。
>
> **⑪ ★★★ 既有断言的【措辞】是一种契约**（**轮 255 实测：我改写一条错误消息，打断了一条既有断言** ✗✓）：**该断言钉住的是 `caps every claimant` 这句原文** ✓ ⇒ **我把消息改成 `capped at <ceiling>` ⇒ 断言红** ✗。**可操作做法** ✓：**改进一条消息时，【原文逐字保留】、新信息【追加】其后** ✓（**轮 255 的做法：`… caps every claimant at N` ＋ `and <键> caps every claimant at M`** ✓）；**若确实要改措辞，先搜到引用它的断言并【同时】更新** ✓。★ **理由**：**这类断言守的是"人能看到的那句话"** ✓ —— **机器可读的 `code`／`hint` 之外的【叙述】也是契约** ✓。
>
> **⑩ ★★★ 插入函数前先量【返回形状】：字符串 `return {` 在一个文件里可以有十几处**（**轮 253 实测：我把两个函数插进了对象字面量内部，语法错** ✗✓）：**我误把返回对象里的【属性行】（`apiVersion,`）当成对象起点** ✓ ⇒ **`const x = new Map()` 落进了 `{}` 里** ✗。**可操作做法** ✓：**① 定位对象起点用【索引计算】而非字符串匹配** ✅ —— **条件＝`return {` 的【下一行】是那个对象的第一个属性** ✓（**该文件里 `return {` 出现 14 处** ✓）；**② 插入后立即 `node --check`** ✓；**③ 函数必须声明在【对象之外】** ✓（**对象里只能有属性与方法，不能有 `const`／`function` 声明** ✗）。
> **同源的另一半** ✓：**向上扫"方法签名"时会先撞上自己的守卫行** ✗（**轮 253：`evidence` 因此一直不在签名里，运行时会 ReferenceError** ✓）⇒ **上溯谓词要排除控制语句（`if`／`for`／`return`／`throw`／`const`…）** ✓；**并且：跨执行时，方法名要【先量】再调** ✓（**真名是 `dispute`，我按语义猜成了 `appeal`** ✗）。
>
> **⑨ ★★★ 改动前先【量】：导出名／类型／处数／形状**（**轮 249 的四种错误全属此类；工具已落地为 `scripts/dev/recon.mjs`** ✓✓）：**`exportsOf(模块)` 给出真实导出名与近似名** ✓、**`expectExport(模块, 名)` 名字错就抛** ✓、**`kindOf(v)`／`expectKind(v, 类)` 分清 Array／Set／object／null**（**`typeof []` 是 `object`，这正是把数组当 Set 用的成因** ✓）、**`countOf(文件, 字面量)` 逐处给行号**、**`expectCount(文件, 字面量, n)` 处数不符就抛** ✓、**`linesMatching(文件, 正则)` 先读形状再动手** ✓。
> **为什么必须有** ✓：**结构类错误已被【锚点守卫／行数守卫】挡住**（**锚点未命中即抛且不写入** ✓）；**而"名字／类型／处数／形状"这四类【语义】错误当时没有任何闸** ✗ —— **轮 250 首次使用即见效：对返回形状的假设出现 0 次，`expectCount` 在任何写入之前抛错，`git` 确认目标文件一字未改** ✓✓（**与轮 245"猜锚点 → 劈行 → 弄坏文件"直接对照** ✓）。
> **用法范例** ✓：**改写脚本开头先 `await expectExport(F, 'createX')`、`expectCount(F, '锚点字面量', 1)`，再 `anchored(...)`** ✓；**运行前一律经 `run-checked.mjs`** ✓（**第 ⑤ 条**）✓。
> **可操作规则** ✓：**任何改写脚本【锚点未命中即 exit 非零】** ✓（**`scripts/dev` 的有界编辑器已按此实现** ✓）；**临时脚本打印 SKIP 后继续运行，等同于把失败伪装成成功** ✗✓。**并且：定位优先用【行位置/唯一字面量】，而不是靠缩进猜测** ✓ —— **本轮真行是 `      const parts = []`（6 空格），而我的锚点是 2 空格** ✗。
> **诊断纪律的补充** ✓：**在把某个行为判为"实现失败"之前，先证明【那段代码当前存在】** ✓ —— **"不存在"与"存在但不对"是两种完全不同的故障** ✓✓。

> 这条判据的两种落地形态本阶段都已实现 ✓✓：**`GUARD_FACES` 守卫面登记**（面 ⇒ 语义 ⇒ 生产是否调用 ⇒ 诊断面理由 ✓，`status().guards` 自曝，含"未登记守卫 ⇒ 红"的变异自证 ✓）与 **`EXPECT_UNDECIDED` 显式待办**（未定 ⇒ **只计数不判红**，但**必须可见** ✓）。
>
> **十例清单**（每一例都有可复现的执行输出 ✓）：① 时钟守卫**无人用** ✓；② 审计锚点**永不触发** ✓；③ 四个能力接缝**硬编码 `null`**（`deliver` 还"接了 A 不接 B" ✓）；④ settings 视图**只给 `get()`** 而 13 个模块用属性读 ✓；⑤ 视图是**构造期快照** ⇒ 运行时改设置静默无效 ✓；⑥ 键**构造期冻结**＋**回执撒谎** ✓；⑦ 契约**只在工具边界强制**（内核 API 与工具面互相矛盾 ✓）；⑧ **守卫面生产零调用** ✓；⑨ **漂移检测已接、执行未接**（"被具名报出"就算过 ✗✓）；⑩ **自证模式已接、无人执行**（矩阵 `--selftest` ✓）。
> **制度化的防范** ✓：新增 **`audit-enforced-consistency` 门禁**（四条元规则：无重复／确定性／**行为变了必须在列**／未求值不得在列 ✓ ＋ 6 条造错自证 ✓）；它抓出 **5 条**拒绝不报告 `enforced` ✓，随后又抓出第 5 条"**静态清单**"⇒ 复核后**裁定是门禁自己的"键↔操作"归属表写错** ✓✓ ⇒ **修表而非把模块改成迁就错表**（复核者还为此加了 **`KEY-NOT-ENFORCED-BY-THIS-OPERATION`** 归属断言 ✓）。
> **环境危害（已处置 ✓）**：**工作区上一级目录里那棵"少一个反斜杠"的旁支树** ✗ 曾**反复被创建** ⇒ 核实"只有 3 个早期副本、**无 `.git`**、规范树真身齐全"后**删除** ✓；**我的 shell 现在一律先 `Test-Path` 再断言 `.git`** ✗✓ —— 这道守卫**当场就拦住了我自己的笔误一次** ✓✓（`edit`／`read` **没有**这道守卫 ⇒ 我仍偶发写错路径 ✗，故一律用**规范绝对路径并逐字复制** ✓）。
> **本阶段最硬的一条纪律（mathtools 标准 ✓✓）**：**"读了键"与"键起了作用"必须可区分** ✗✓ —— 回执带 **`enforced[]`**，只列**本次真正被求值**的键 ✓；未接的键在 `status().plannedKeys` 里**逐个点名＋原因** ✓，并断言 **`plannedKeys ∩ wired = ∅` 且两者恰好划分该族全部键** ✓。`kernel/mathtools.js` 用它把 **45/171** 个 `vmu.math.*` 旋钮变成行为 ✓（**未接 126 个逐个点名** ✓：多数需真实求解器／适配器／存储后端 ✓）。
> **门禁新增的守门能力** ✓（都由真实缺陷逼出来 ✓）：**import 闭包必须随包**（两次救回 `MODULE_NOT_FOUND` ✗✓；第 7 轮复核后**把 `tests/` 也纳入** ✓）、**代码读的键必须已登记**（抓出 v5r 包的真旋钮与 40+ 未登记键 ✓）、**一个旋钮只能有一个名字**（抓出多组别名 ✗✓）、**契约面必须与模块公开面一致**（抓出 `vmu.library` 缺 5＋3 个方法 ✗✓）、**注册的服务必须真的被构造**（抓出 `mathjobs` 注册却未建 ✗✓，自带"改坏必红"自证 ＋ **6 变异族** ✓）、**`§8.1` 逐行给"已实现 ✓/提案 ⛔＋实现位置"**（第 21 轮 ✓：**"文档写提案码、代码却抛别的码"这类语义错位终于有人抓** ✓，新门禁自带 **6 条故意造错自证** ✓）。
> **已知未闭合的门禁缺口** ✗（如实记录 ✓）：① `audit-vmu-services` 的绑定判定曾是**文本匹配** ⇒ 注释里的假绑定可绕过 ✓；**第 16 轮已用保长状态机修好** ✓（第 8 轮复核：保长 10/10 成立 ✓；第 8 轮指出的**正则字面量**与 **U+2028/U+2029** 缺口第 16 轮已补 ✓）。② `03-§8` 不区分"已实现／提案" ⇒ **第 21 轮已修** ✓（§8.1 逐行状态 ＋ 新门禁 ✓）。③ 键扫描只认**引号字面量** ⇒ 拼接/模板键不可见 ✓、跳过 `settings/` ✓、两段键跳过 ✓（洞已被**注释显性化** ✓ 但未闭合 ✗）。
> **两处"修好一个又引入另一个"的实例（已修，记账 ✓）**：**① 前跳守卫**：第 20 轮加"前跳 clamp" ⇒ 第 10 轮复核实测**长休眠会让时间永久冻结**（10 个服务的 TTL 停止推进 ✗✓，唯一"比修复前更危险"的变化 ✓）⇒ 第 21 轮改**有界 clamp ＋ resync 出口**（超 `resyncMs` ⇒ 接受并自曝 `resynced:true` ✓，`status()` 暴露 `frozenSince` ✓）；**裁决**：`onForward:'refuse'` **优先于 resync** ✓ —— 显式拒绝优于静默接受 ✓，但其**代价是"长休眠下会一直拒"** ✓ 故必须**知情** ✓（本行为文档化 ✓）。**② `mathjobs` 注册却未构造**（第 14 轮 ✓）⇒ 已加门禁 ✓。
> **独立复核发现并已修的真实缺陷** ✓（第 7–8 轮 ✓）：三孤儿模块（`crypto`／`lifecycle`／`notify` 被测试 import 却**不随包** ✗✓）、`canonicalize` 的 **5 类归一化碰撞**（`NaN`≡`null` 等 ⇒ 幂等可被静默绕过 ✗✓）、**`scope` 不参与台账身份**（跨作用域串账 ✗✓）、`replay.apply()` 遇非法/循环初值**裸崩** ✗✓、审计环**写死 100** 与声明值 64 不一致 ✗✓。
> **内核侧仍缺的服务面** ✗（批评者第 7–8 轮 ✓，本轮派单 3 项）：**N1 防篡改审计链**（K5 的输入可信性 ✓）／**N2 幂等台账持久化**（否则"重启正是重试发生的时刻" ✗）／**N3 时钟单调守卫**（回拨会同时废掉 TTL 与幂等 ✓）／**N4 状态版本与迁移**（旧快照会被静默误读 ✗）／**N5 非 JSON 安全状态的契约**（`JSON` 克隆有损 ⇒ "字节一致"掩盖语义漂移 ✗）✓。
> ## 本阶段最重要的一条纪律：**"接线上线 ≠ 机制生效"** ✗✓✓
> 由独立复核在**同一件事上连续抓到三次**（每次都有执行输出 ✓）：
> ① **时钟守卫**：模块写好了、测试绿了，但**没有任何 TTL 敏感服务用它** ⇒ 回拨仍会复活过期条目 ✓（**修复**：4 → **10 个服务**改用守卫时钟 ✓，并用**无守卫对照组**证明它真的在干活 ✓）；
> ② **审计锚点**：seam 接好了、回执也对，但**全仓 `checkpoint()` 调用点＝0** ⇒ 锚点文件**永远不会被写入**，防删尾**仍在睡觉** ✓✓（**修复**：内核自带**非零默认节奏**（100 行 ✓；0＝手动且**必须知道删尾不可检出** ✗）＋ `auditVerify()` **真的用锚点** ＋ 显式 `auditCheckpoint()` ✓；我自己的探针在修的过程中又**两次**发现"传了参数却不生效"（模块读的是**设置属性**、且是**字面量键** ✓）⇒ 两条通道都满足后才 PASS ✓）；
> ③ **`enforced[]`**：模块宣称"`enforced` 是可审计的接线证明"，但**恰在请求被拒时 `enforced:null`** ✓，且 **13 个键确实改变了行为却不在列** ✓（**修复**：拒绝路径必带已评估键 ✓、补齐 13 键 ✓、并引入 **`fired[]`**＝真正改变结果的键 ✓）。
> **⇒ 本阶段的验收标准据此提高** ✗✓：**"机制存在"不算完成；必须"有调用点、有可观测影响、有对照或反证"** ✓；任何新增自曝字段/接缝都要回答三问 ✓：**谁调用它 ✓／不调用会怎样 ✓／怎么证明它真在工作 ✓**。这条纪律已写成 §8.1 逐行状态门 ＋ `enforced` 一致性门（C2 ✓）的制度形态 ✓。
> **另两处"修好一个又引入另一个"**（已修 ✓，见上）＋ **一次"探针自己覆盖证据"**（复核者在篡改文档用例里又调用了写入 ⇒ 把证据覆盖掉 ⇒ 改只读触发后才拿到真结论 ✓）⇒ 纪律：**测"加载期"校验必须用只读触发并断言零写入** ✓。
| 批 1 · 其余 | 工作流／控制／调度 | `08-§4` | — | — | **未开始** ✗ |
| 批 2–5 其余 | 信任/仲裁/归档/计算/合规 | `17`／`07`／`09·15`／`16·20` | — | — | **未开始** ✗ |

> **本阶段累计** ✓：**9 个内核服务**（`governance`／`board`／`minutes`／`budget`／`metrics`／`audit`／`alerts`／`retention`／`delegation` ✓）、**408 条新断言** ✓、**设置表已接线键 51 → 138（/995）** ✓；**每一块都附"未做清单" ✗**（例如委托无耐久投影、保留的分层只标记不下沉 ✓）—— 这些**不算已实现** ✗。
> **接入时发现并修掉的真实缺陷** ✓（绝大多数由门自动抓到 ✓）：未声明的真旋钮（v5r 包的 `requireSettledRecords` ✗）、缺的 `ratio` 类型 ✗、**同义不同名**若干处（`meetings.minutesDetail` ✗、`retention.keepEvery` ✗、`MATH_TIMEOUT` 曾被写成 `VMU_MATH_TIMEOUT` ✗）、`roots` 权限来源**不得靠猜角色名** ✗（改为显式设置 ✓）、**接线检测把注释里的名字当成"读过"** ✗（两处 ✓）、**`library` 契约面缺方法** ✗（5＋3 个 ✓）。

> **登记自愈** ✓：某键被实现后，我从生成计划区把它**移入手写核心表**（`settings/schema.js` 的 `CORE_DEFS` ✓）⇒ `planned.js` 因"已存在"**自动停止**声明它 ✓，`docs/04 §11` 该行变 `✅ 已接线` ✓，`00-§3.2` 的逐卷接线数**自动上升** ✓ —— **不需要手改任何统计** ✗。

**每块实现的接入清单（Lead 专用 ✓，按此逐项做完才算"落地" ✓）**：
1. **模块**：读它的公开面与未做清单 ✗；确认它只读注入的 `clock`（无 `Date.now` ✓）、拒绝全走具名 `refuse()` ✓、上限全报丢弃计数 ✓；
2. **接线**（`kernel/index.js` ✓）：加 import ✓ → 创建实例（`settings: { get: (k) => settings[k] }` 适配器 ✓）→ `registry.register('vmu.<面>'…)` ✓ → 加 getter ✓；
3. **键迁移**：把它真读的键从生成计划区**移入 `CORE_DEFS`** ✓（类型/默认取自实现或卷 ✓，`hot`/`who` 先统一 `H1`/`office` ✓）；
4. **码登记**：它抛的新码 ⇒ 补进 `docs/03-§8` ✓（并用 `regen-all` 让计划码块保持同步 ✓）；
5. **随包**：新运行时文件＋新测试 ⇒ `package.json#files` ✓ **与** `installer.js` ✓（**新门**会守 import 闭包 ✓，但 installer 的清单仍要手加 ✓）；
6. **门禁**：`node scripts/regen-all.mjs` ✓ → 单跑新套件 ✓ → 相关老套件（kernel／entry／host／pack ✓）→ T0 ✓ → 提交 ✓；
7. **回写**：本节的状态列 ✓ ＋ `14-§4` 的分批表 ✓ ＋ 该卷"实现现状"（若有 ✓）。

---

## 10. 原始愿景逐条符核表（**活文档**；每轮回写 ✓）

> 用途：回答"**当前实现是否充分遵循用户原始愿景**" ✓。规则：**只写有证据的行** ✓；未做的一律写"❌／⚠️" ✗，**不得**用库内测试冒充真机 ✓；每条给出"计划"指向本轮工作轨道（Track A＝文档逐册校对／Track B＝把承诺接线为真／③＝能力缺口）。

| # | 愿景条款（用户原文要点） | 现状（**2026-10-09 回写** ✓） | 证据（可核） | 差距 | 计划 |
|---|---|---|---|---|---|
| **V1** | 本体是一个 **agent preset**（id `vibe-math-vmu`）且是**框架** | ✅ | 真机 P0 六项全 PASS（`live/2026-10-09/p0-final/` ✓）；`agent.cordis.yml`；`vibe-math-vmu.js` | — | — |
| **V2** | 运行机制 = **框架 ＋ settings ＋ 中间件（＋代理自组织）** | ✅ | 四形态中间件＋总线＋**宿主钩子桥**：真机 M1 拒绝**含中间件 id** ✓、M2 模块拒绝 ✓、M4 整合包应用 ✓、**M3 脚本真机通过 ✓✓**（2026-10-10，`p2-m3-stack4` ✓）；**零机制**：无配置只注册 **1** 个只读工具 ✓（有断言 ✓） | **宿主 `cwd`/`env` 零容忍缺陷仍在** ✗（我们给了调用侧规避 ✓，见 11-§9.6 ✓） | 已不再阻塞 ✓ |
| **V3** | 提供**尽可能多**的六域**基础设施** | ✅ **六域都能在会话内驱动** ✓（★ 工具面**见 `docs/18` 的生成式索引** ✓ —— ★ 本格原先写 **8** 个 ✓，★ 轮 508 只改了后半格、【前半格漏了**]✗，★ 轮 511 补 ✓） | `kernel/` **模块数以生成器输出为准** ✓（★ **本格不再手写这个数** ✗ —— 权威值＝`node scripts/regen-all.mjs --check` 的 `kernel-index` 行；全量清单见 `docs/02` 的生成式内核索引 ✓）；工具面按 **10** 个 ✓（★ 更正 ✗：原写 8 ✓；★ **清单见 `docs/18` 的生成式工具索引** ✓）按声明出现：`status/set/middleware/records/script/pack/control` ✓ ＋ **`vibe_vmu_meeting`（会议＋表决 ✓）／`vibe_vmu_task`（任务板 ✓）** ✓✓ —— 分别为**会议/表决**与**任务**提供了"可按 id 寻址、不复制策略"的会话面 ✓（`03-§3.1` ✓、场景 `vmu-entry` 第 15 组 ✓） | **归档**早在 `vibe_vmu_records` ✓；**预算/资源面**仍是**部分** ✗（工具调用上限已强制 ✓；内存/并发上限未接 ✗） | 按需接余下 18 键 |
| **V4** | **可调控参数**尽可能多且**真的可调** | ✅ **键数与接线数一律见生成器输出** ✓（★★ **本节不手写这类计数** ✗ —— 权威值＝`node scripts/regen-all.mjs --check` 的 `settings table` 与 `readiness figures` 行，以及 `docs/04 §11` 生成表 ✓；**旧数字 717／51／666／1147／1028／119 全部作废** ✗）：**两个生成式登记物**把"设计阶段声明的参数"变成机器可见的**诚实账** ✓ —— `settings/planned.js`（**计划键数见生成器输出** ✓，从 docs 生成 ✓）＋ `03-§8` 计划码块（**计划码数与其中提案 ⛔ 数同见生成器输出** ✓ —— ★ 口径见轮 422：**"已实现"以【运行时代码】为准**，且**运行期扫描【不得跳过 `settings/`**】✗，因为 `settings/schema.js` 是运行时被 import 并执行的 ✓）；接线数由**生成器**计算、由审计**独立重算** ✓ | `docs/04 §11`（生成表 ✓，每行标"未接线" ✓）＋ `00-§3.1`（登记物说明 ✓）＋ 各卷"拟增键全表" ✓ | **"未接线"的键数见生成器输出** —— ★ **这不是欠账，是预留的自由度** ✓（★ 详见 `04 §6.3` 的三档读法 ✓）：**框架声明"能被设什么"，接线是 pack／中间件按自己的需要做的** ✓；实现时每键必须从 `planned.js` **移入**手写核心表并给真元数据 ✓（`--check` 会守 ✓） | 按卷分批实现（每批 T0→T1→提交 ✓） |
| **V5** | 用 settings ＋ 中间件即可**复现 v2–v5r**（整合包） | ✅ **两种运行模式的包都已落地并会真正触发** ✓✓ | `packs/v5r/prompts/v5r-core.js` ✓（席位／机制默认／**真实工具上的 M1 规则**／**随包 M2 模块**／设置层报告 `pack:v5r-core` ✓／服务级别名 ✓，`vmu-entry` 第 13 组 ✓）＋ **`packs/v3-core/index.js`** ✓（`planner:1／solver:8／verifier:3` 槽位 ✓／v3 机制默认 ＋ 包自有 `vmu.v3.*` ✓／**两个随包 M2 模块**：`ballot/tally` 强制 **verifier 法定数** ✓、`mode=manual` 拒绝派发 ✓，第 14 组 ✓） | **行为级 A/B 未做** ✗（P3 收尾 ✓）；**v2-pack 未做** ✗ | 10-§5.1 方法 ⇒ P3 |
| **V6** | 可通过 settings／中间件**设置·安排·管理·编辑提示词** | ✅ | **入口已接线** ✓：`config.promptSections`／`promptBindings`／`promptOverrides`／`whoMayOverride` ＋ settings `vmu.prompts.*` ✓；**覆盖 > file > text** ✓；**宿主 `systemPrompt` 收到生效后文本** ✓（场景 8 ✓）；两种"来源"视图分开 ✓（06-§10 ✓） | **运行期改提示词无工具面** ✗（改配置/覆盖文件 ✓）；按 `owner` 注入成员会话**未真机验收** ✗ | 真机场景 |
| **V7** | **控制流**（暂停/恢复/停止/心跳） | ✅ | `pause/resume/stop/beat` ＋ `control()` ✓；**暂停真门禁**（任务 ✓ 会议 ✓ 表决 ✓）；`wallClockMs` 作心跳预算 ✓；`vibe_vmu_control` 仅声明时出现 ✓（场景 ✓） | `control.can-*` 判定点／定时器**未做** ✗；归档面未接暂停 ✗ | 按需 |
| **V8** | 会议／表决／工作流**原语** | ✅ 库面 | `kernel/{meeting,ballot,tasks}.js` ＋ 场景（含 **v5r `s8-freeze-say` 等价回归** ✓）｜会议三键**真强制** ✓（超时／引用条数**拒**／引用深度**折叠计数** ✓） | 无逐个工具面；议程/动议实体、分钟确认未做 ✗ | ②已允"仅库面" ✓ |
| **V9** | **数学计算/工具**面 | ⚠️ **已接真宿主** ✓；**子进程路径已通 ✓✓、真机真实编译/证明仍未跑** ✗ | `host-math.js`（`register/params/projectRoot/fs/resolveExecutable/spawn` ✓，路径逃逸具名拒 ✓）；6 个 `vmu.math.*` 生效 ✓；`math_computation` 仅声明数学意图时发布 ✓；**M3 真机已解除 ✓✓**（同一个 spawn 接缝 ⇒ 真机子进程可用 ✓） | **真机 `math_computation run`／Lean 编译从未跑过** ✗（下一步 ✓）；Lean 面无提示词段 ✗ | 跑一次真机最小计算 ⇒ 再决定 Lean 面 |
| **V10** | **文件归档／耐久** | ✅ | `store.js`＋`library.js` ✓＋**审计落盘** `<root>/vmu/audit/<day>.jsonl` ✓（写失败具名 ✓）＋**在途台账** ✓（重启后标 `interrupted`＋owner ✓） | 反向迁移（回退）未实现 ✗；只有结构校验（无引用完整性）✗ | 按需 |
| **V11** | 复用/重构 v5r，**不为省事堆屎山** | ✅ | 共享数学模块**原样复用**（字节一致门 ✓）；v5r 55 参数/56 工具/30 代码族**四分类报告** ✓；`vmu-containment` 33/0 ✓；**面级真机对照** ✓（54 工具/24 295 in ↔ 6 工具/7 212 in ✓） | 会议语义已成包 ✓ 但**行为级 A/B** 未做 ✗ | P3 收尾 |
| **V12** | **详细系统、全面完整的开发者文档与使用说明** | ✅ **14 篇逐册校对完成** ✓✓ | **15 篇** ✓；仓内门禁：`audit-vmu-docs` **52 断言** ＋ **15/15 变异** ✓（文档集／码登记**双向**／服务面**按已发布集合**／**工具面**／**设置键面＋接线**／**接线面**／**钩子生产双向** ✓）；`audit-vmu-release` 22＋6 ✓ | 待补：`since` 列、逐键示例、配方**逐条跑通** ✗ | 按需 |
| **V13** | **扩展性**：可写额外插件／mod | ✅ 机制＋契约均已按代码写实 | `registry`（每服务 `apiVersion` ＋ 单一 `packContractVersion` ✓）；`pack.js` 真实清单规范 ✓；03-§2 **已发布服务表＋未发布清单** ✓；**pack 可携带 M2 代码模块** ✓（`v5r-core` ✓） | M4 外部**插件包**（client 面）未做 ✗ | 按需 |
| **V14** | 允许**破坏性重构**，一切以**最优实践**优先 | ✅ 已实际执行 | 本阶段提交链 `61385cd`→`45ec07c`（宿主四件、控制流、台账、审计落盘、v5r-core 包、Track C 门禁 ✓） | — | — |

**结论（2026-10-09 回写 ✓，不粉饰 ✗）**：**V1／V2／V6／V7／V10／V11／V12／V13／V14 已达标 ✓**（其中 V12 是**本轮才达标** ✓）；**V3／V4／V5／V8／V9 属"部分" ⚠️**，且**每一处"部分"都已写明具体差距** ✗（工具面窄／18 键未接／行为级 A/B 与 v3-pack／归档无工具面／真机数学未跑通）。
⇒ **"是否充分遵循原始愿景"**：**达成 ✓✓（主体与"最后一公里"均已落地并留证）** —— 框架＋settings（**键数与接线数见生成器输出** ✓ —— ★ 本行不手写这些数 ✗；★ 注意 **54 是【工具】数**，不是键数 ✗）＋中间件四形态（含**包内携带 M2 代码模块** ✓）＋**v5r／v3 两个整合包**（都会真正触发 ✓✓）＋提示词管理（入口接线 ✓）＋控制流（**暂停是真门禁** ✓）＋数学宿主接缝 ✓＋审计**落盘** ✓＋在途台账 ✓＋**六域工具面**（`vibe_vmu_meeting` 会议/表决 ✓、`vibe_vmu_task` 任务板 ✓、`vibe_vmu_records` 归档 ✓，其余按声明出现 ✓）—— 全部**可用、被门禁与场景守护、且关键面在真机验证过** ✓✓；**行为级 A/B 已实跑一轮** ✓（同任务/同模型/同主机、仅换预设 ✓，报告 `_oneoff/vmu/design/05-p3-ab-report.md` ✓；其 ①② 对照因**环境**（不存在"未装 vmu 且 CLI 同代"的 profile ✗）标为**受限** ⚠️）；**发布门禁 `release-check` ALL PASSED** ✓；**T3 非增量全量两次全绿** ✓✓（`132/132` 于 `1fe6ffc`；**`134/134` 于 `8ffdf82`**，三片零重试 ✓）。
**仍未做（明确 ✗）**：① ~~真机 M3~~ ⇒ **已解除 ✓✓（2026-10-10，`p2-m3-stack4` ✓）**；**残留**：宿主 `cwd`/`env` 零容忍缺陷仍在 ✗，规避写在 `host-spawn.js` ✓；**真机 `math_computation run`／Lean 编译仍未跑** ✗；② **3 个未接线键**（`core.storeBackend`／`safety.approvalRequired`／`records.meetingKeepEvery` ✓）—— **逐键已标注"改了不会有行为变化"** ✓，且已按"接／配／停"分类 ✓；③ **干净 A/B 复跑**＝**环境受限** ✗（已留证 ✓）；④ **v2 包**—— **不在本目标条款内** ✓（条款只要求 v5r／v3 ✓，二者均已交付 ✓）；⑤ **`pathPolicy` 的 spawn-cwd 一路**：**已接线 ✓（opt-in ✓）** —— 仅当配置**显式声明**策略时拦截 ✓（spawn cwd 常是 agent 工作区而非内核 root ✓，按默认拦会误伤 ✓）。**版本号与发布：须用户批准** ✗（机器面证据已齐 ✓）。

---

## N16 工程研发流程（Engineering Flow：需求→设计→实现→验证→发布）

> 状态：**设计稿 v0.1（本卷新增节）** —— 补齐 **N16 缺口**（`工程研发`／`工程流程` 关键词实测 **0** ✗）✓；**不新建卷** ✗✓；**不动作内核** ✗：阶段与闸点**声明式**表达 ✓，闸点**委托**既有原语 ✓。
> 上位：本卷头部 `> 上位：`；**与 `16-research-lifecycle.md` 并列而非混用** ✓（研究生命周期管"研究推进" ✓，本节管"工程交付" ✓）；**闸点原语只引用** `16` 卷与 `kernel/lifecycle.js` ✗✓。

**五个阶段（每阶段一条"闸点"，判据委托、不自造 ✗）** ✓：

> ★★ **读法提示（避免把它当待办清单 ✗）**：下表最后一列是**【闸点未过时的处置**】✓，**不是"我们还没做这件事"** ✗ —— ★ 例如"需求"行的 `未做 ✗` 意思是**验收口径若不可核对，就把该条目标记为未做** ✓（★ 这是**动作** ✓），而"实现"行的 `未做 ✗` 意思是**变更若缺作者与理由，就标未做** ✓。★★ **本卷没有把"需求/变更集机制"列为未做** ✓ —— ★ **它们已经存在** ✓：**变更的作者、时刻与理由由 git 提交信息承担** ✓，**逐轮的判断与取舍记在 `28-decision-history.md`（历史卷）** ✓，★ **本节要求的是"每条变更都得能追溯到作者与理由"，而不是另建一套台账** ✗。★ **同类误读的另一个实例见 `04` 卷的 `⚠️ 未接线`（那是"预留旋钮"，不是欠账 ✓）。**

| 阶段 | 入口产物 | 闸点（委托） | 未过 ⇒ |
|---|---|---|---|
| **需求** | 需求条目（`req-*`：谁要／为何／验收口径 ✓） | 验收口径**可核对** ✓ | **未做 ✗**（标记词同行 ✓） |
| **设计** | 设计说明（接口形状／不变量／边界 ✓） | 与 `03` 的接口契约**一致** ✓ | **拒**（具名 ✓） |
| **实现** | 变更集（谁/何时/为何 ✓） | **变更控制**：每条变更**有作者与理由** ✓ | **未做 ✗** |
| **验证** | 门禁证据（T0/T1/T3 分层见本卷 §门禁 ✓） | **与既有门禁互相引用** ✗✓ | **不发布** ✗ |
| **发布** | 发布清单（见下 ✓） | 清单**逐项勾选**＋版本须**用户批准** ✗✓ | **不发布** ✗ |

**代码审查与变更控制（who/why/when ✓）** ✓：每条变更记录 `{ by, at, why, touches }` ✓（**时刻取自注入时钟** ✗不读真实时间 ✓）；**审查不是仪式**：审查者必须给出**一个可反驳的理由**或**明说"未审"** ✗✓。

**缺陷分类与回归** ✓：缺陷分 `设计缺陷／实现缺陷／规格歧义／环境缺陷` 四类 ✓；**回归＝复跑既有门**（**不新建回归机制** ✗）✓；修缺陷必须**带一条门/场景证据** ✓，否则标 **未做 ✗**。

**发布清单（与本节及本卷门禁互相引用 ✓）**：① 变更集已审 ✓；② 门禁全绿（**非增量** ✓）；③ 发布说明含**用户可见变化**＋**未做项 ✗**；④ 版本号变更**须用户批准** ✗✓；⑤ 回退路径写明 ✓。

**提案码**：**无**（**只引用** `03-§8` 既有登记 ✗✓；若日后需要"发布清单未勾完"专属码 ⇒ 列为提案 ✗）。

## N16 未核项

1. **发布清单的机器可校验形态**（勾选是"人工声明"还是"由门禁派生"）**未定** ✗ —— 见 `14-§2`（未决登记）✓；
2. **缺陷分类的自动化**（从失败输出推断类别）**未做** ✗ —— 本卷只给**分类词表** ✓；
3. **与 19 卷（插件与扩展开发）的交界**：19 管**扩展面** ✓，本节管**流程面** ✓，**交界只写一次** ✗✓ —— 具体哪一卷承载"第三方扩展的审查"**未核** ✗（见 `14-§2` ✓）。

---

## 知识可发现性（N15：策略／参数／码"怎么找到"）

> 状态：**设计稿 v0.1（本卷新增节）** —— 补齐 **N15**（`可发现性` 关键词实测 **1** ✓，本节把它写成**可执行的三条入口** ✓）；**只引用已存在的生成物，不重定义** ✗✓。
> 上位：本卷头部 `> 上位：`、`00-README.md`（阅读顺序 ✓）、`14-open-items-and-roadmap.md`（未决/未核登记 ✓）。

**三条入口（找"一条策略／参数／码"就这三个去处 ✓）**：
1. **生成索引** ✓：`04-settings.md` 的**参数全表**（键／类型／默认／热改／**接线与否** ✓）＋ `03-§8` 的**码表**（**已实现／提案**应可区分 ✓）—— **只引用**其生成物 ✗；
2. **术语表** ✓：本卷＋`01` 的术语（`策略`／`闸点`／`委派`／`记录轨`…）**一词一义** ✓；**新词先登记再使用** ✗✓；
3. **逐卷状态页** ✓：每卷头部的 `> 状态：`／`> 上位：` 两行 ✓ ⇒ **按卷定位**（"这条规则属于哪一卷" ✓）。

**新卷/新键登记清单（对代理自组织尤重要 ✓）** —— 新增任何东西，**必须**同时更新这几处 ✗✓：
| 新增 | 必更新 |
|---|---|
| **新卷** | `00-README.md` 阅读顺序（**生成块之外** ✗✓）＋ `14` 卷登记 ✓ |
| **新键** | `04-settings.md` 参数表（含**默认值**与**接线状态** ✓）＋ `03` 若对外承诺 ✓ |
| **新码** | `03-§8` 码表（**已实现／提案**标注 ✓） |
| **新工具** | `03` 工具表 ＋ 本卷门禁（**未实现工具名与标记词同行** ✗✓） |

**"未做"如何被发现** ✓：统一标记词 **`✗`**（未做）／**`⚠️`**（部分）／**`✓`**（已做）✓ ⇒ **`grep ✗` 即可列出全部未做** ✓✓；每条未做**必须同段给出"缺什么"** ✗✓（不得只写"未做" ✗）。

**提案码**：**无**（本卷**只引用**既有登记物 ✗✓）。

## 知识可发现性 · 未核项

1. **索引的自动生成是否已存在**（`04`／`03-§8` 的生成器）**未核** ✗ —— 见 `14-§2`（未决登记）✓；
2. **术语表的权威位置**（本卷 vs `01`）**未定** ✗ —— 见 `14-§2` ✓；
3. **`grep ✗` 的可执行入口**（是否提供一条脚本）**未做** ✗ ✓。

<!-- BEGIN GENERATED: zero-mechanism-matrix -->
<!-- 本块由 `scripts/generate-zero-mechanism-matrix.mjs` 生成（生成式 ✓，勿手写 ✗） -->

| 模块 | 零机制下的返回形状 | 是否具名拒（码） | 自曝字段 | 期望（设计） |
|---|---|---|---|---|
| `activity` · `status()` | ok | — | — | ok 或 object（**先实测后登记**（Round 3 探针）：零声明下 `status()` ⇒ **ok（object）**——等待器数为 0、无同伴接缝时 `peerCheck.seam=false` 自曝 ✓；**零机制＝没有等待者、`wait()` 会以具名拒/立即 noProgress 收场**，但 `status()` 作为状态面**放行不拒** ✓。★ 判据＝**状态面可读、不拒**；"没有等待者"**不得**被读成"等待原语没生效"（由 `falsify` 族证明 future-only 与 disposer 真会红 ✓）） |
| `alerts` · `status()` | ok | — | dropped=[object Object] | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `arbitration` · `open()` | refusal | VMU_ARBITRATION_OFF | enforcedScope=evaluated-so-far | 具名拒或 ok（task-214 批 3 补参（形状取自测试 vmu-arbitration.test.mjs:261 `open({parties,subject})`）：补参前实测具名拒 **VMU_ARBITRATION_OFF**（带口径 `enforcedScope=evaluated-so-far`）⇒ 若补参后仍拒，则"具名拒即零机制真实形状"✓；若放行 ⇒ 亦合规 ✓） |
| `audit` · `status()` | object | — | dropped=0 | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `auditchain` · `status()` | object | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `ballot` · `open()` | ok | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `ballotbox` · `open()` | refusal | VMU_CONFLICT | enforced=[0] enforcedScope=evaluated-so-far | 具名拒或 ok（task-214 实测：`open()` ⇒ 具名拒 **VMU_CONFLICT**（带口径 `enforced=[0]`）⇒ 零机制＝无票面参数 ⇒ 具名拒；有默认 ⇒ ok ✓） |
| `bidding` · `list()` | ok | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `board` · `status()` | ok | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `budget` · `open()` | object | — | — | ok 或 object（task-204 实测（形状取自测试 vmu-budget.test.mjs:16）：不传 settings 下 `open({scope})` ⇒ **ok**（零机制＝不限额、放行 ✓）） |
| `bus` · `status()` | object | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `capacity` · `list()` | ok | — | enforced=[0] fired=[0] enforcedScope=evaluated-so-far | ok 或 object（实测 `list()` ⇒ **ok**（`enforced=[0] fired=[0] enforcedScope=evaluated-so-far` ⇒ 零机制**清单可读、不拒** ✓；**键数由本生成器实测输出** ✓）） |
| `charter` · `propose()` | refusal | VMU_CHARTER_NOT_AUTHORIZED | — | 具名拒或 ok（task-214 批 3 补参（形状取自测试 vmu-charter.test.mjs:236 `propose({kind:"charter",text,by,articles:[{id}]})`）：补参前实测具名拒 **VMU_CHARTER_NOT_AUTHORIZED** ⇒ 补参后若放行 ⇒ ok ✓；若仍具名拒 ⇒ 写明"缺参即其零机制形状" ✓） |
| `chat` · `list()` | ok | — | dropped=0 truncated=false | ok 或 object（实测（轮 2）：零声明下 list() ⇒ **ok**（自曝 dropped=0、truncated=false ⇒ 零机制＝无群聊/无收件人 ⇒ 清单可读、**不拒** ✓）） |
| `citations` · `status()` | ok | — | dropped=0 | ok 或 object（实测（轮 224）：零声明下 status() ⇒ ok（entries: 0；freeTextIsOffByDefault: true 自曝 ✓）；无条目⇒无可渲染对象，**不拒** ✓） |
| `clockguard` · `status()` | null | — | — | ok 或 null（时钟守卫：无声明 ⇒ 不拦（返回 null 亦合规）） |
| `collab` · `status()` | ok | — | dropped=0 | ok 或 object（实测（轮 224）：零声明下 status() ⇒ ok（counterparties: 0、agreements: 0 自曝 ✓）；agreementRequired 默认 true 但无对手方⇒无可交换对象，**不拒** ✓） |
| `compliance` · `status()` | ok | — | enforcedScope=evaluated-so-far | ok 或 object（实测 `status()` ⇒ **ok**（`enforcedScope=evaluated-so-far` ⇒ 状态可读、**不拒**）。**ROUND 153 更正** ✗✓：本行原先还写"`exportControlCheck` 归 domaingate ✓" —— **实测 `domaingate` 并没有该检查** ✓（`grep export|control` 只命中 `apiVersion` 与注释 ✓），那是**愿望**不是**承载者** ✗；该能力是**全仓缺口** ✓，归属面与复活条件写在 `compliance.js` 的 `PLANNED_REASONS` 里 ✓） |
| `conference` · `open()` | ok | — | enforced=[2] fired=[2] enforcedScope=evaluated-so-far | ok 或 object（实测 `open()` ⇒ **ok**（`enforced=[2] fired=[2]` ⇒ 零机制**按默认阶梯开成、放行** ✓，与 `meetings` 同口径 ✓）） |
| `contentvalue` | （无 create* 工厂） | — | — | EXPECT_NA（纯函数工具模块（**无 `create*` 工厂** ⇒ 矩阵不适用 ✓）；轮 9 从 `resume.js` 抽出（该文件越过 1200 行 ⇒ 拆分，未往 `KNOWN` 加名字 ✓）：值标识原语 `stableStringify/contentDigest/clone/idSuffix`，纯函数零依赖 ✓） |
| `control` · `status()` | ok | — | dropped=0 | ok 或 object（实测（轮 224）：零声明下 status() ⇒ ok（paused: []、registrySize: 0；archivingNeverPausedByItself 与 idleNeverRecessesByItself 自曝两条不变式 ✓）） |
| `course` · `open()` | refusal | VMU_INVALID_ARGUMENT | enforced=[1] enforcedScope=evaluated-so-far | 具名拒或 ok（task-214 实测：`open()` ⇒ 具名拒 **VMU_INVALID_ARGUMENT**（带口径 `enforced=[1]`）⇒ 零机制＝缺课程参数 ⇒ 具名拒 ✓） |
| `crypto` · `status()` | object | — | dropped=0 | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `custody` · `status()` | ok | — | dropped=0 | ok 或 object（实测（轮 224）：零声明下 status() ⇒ ok（entries: 0；chainRequired: true 自曝 ✓）；无条目⇒无可转移对象，**不拒** ✓） |
| `delegation` · `check()` | ok | — | — | 具名拒或 ok（task-214 批 3 补参（形状取自测试 vmu-delegation.test.mjs:30 `check({actor,action})`）：补参前实测具名拒 **VMU_INVALID_ARGUMENT**（带口径 `enforcedScope=evaluated-so-far`）⇒ 补参后应见判定对象（放行）⇒ 已放宽为"具名拒或 ok" ✓） |
| `discipline` · `status()` | ok | — | dropped=0 | ok 或 object（实测（轮 224）：零声明下 status() ⇒ ok（subjects: 0；breakerOffMeansOff: true 自曝「阈值 0＝机制关，而非允许零次失败」 ✓）） |
| `env` · `list()` | ok | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `explain` · `build()` | refusal | VMU_EXPLAIN_REASON_REQUIRED | — | 具名拒（带 code）（实测（轮 224）：矩阵的**探针**调用在零声明下【具名拒】 ✓——render() 无报告可渲染时以 VMU_INVALID_ARGUMENT 具名拒（status() 本身仍是 ok ✓，但探针走的是调用路径 ⇒ 期望取实测的拒 ✓）。**不假装成功** ✗） |
| `external` · `status()` | object | — | dropped=0 | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `fairness` · `status()` | ok | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `fidelity` · `status()` | ok | — | — | ok 或 object（**先实测后登记**（Round 3 探针）：零声明下 `status()` ⇒ **ok（object）**——缺陷登记数为 0、`durable:false` 在无 fs 接缝时**具名自曝** ✓；**C-45 是内核谓词、强制不可配置**（零个设置键）⇒ 零机制＝**没有已声明缺陷 ⇒ 不改写任何票**，状态面放行不拒 ✓。★ 判据＝**状态面可读、不拒**；"0 条缺陷"**不得**被读成"强制点没接线"（由 `vmu-fidelity-abstention` 的改写断言证明 ✓）） |
| `formal` · `check()` | refusal | VMU_MATH_INVALID_INPUT | enforced=[0] enforcedScope=evaluated-so-far | 具名拒（带 code）（task-214 实测：`check()` ⇒ 具名拒 **VMU_MATH_INVALID_INPUT** ⇒ 零机制＝无形式化请求 ⇒ 具名拒即真实形状 ✓） |
| `funding` · `list()` | ok | — | enforced=[0] fired=[0] enforcedScope=evaluated-so-far | ok 或 object（实测 `list()` ⇒ **ok**（`enforced=[0] fired=[0]` ⇒ 零机制清单可读、**不拒**；**键数由本生成器实测输出** ✓）） |
| `governance` · `keysUsed()` | array[15] | — | — | array 或 object（治理面：只读列举（keysUsed/partition 不拒）） |
| `guard` | （无 create* 工厂） | — | — | EXPECT_NA（非服务模块（无 `create*` 工厂 ⇒ 不适用 ✓）） |
| `handover` · `open()` | ok | — | — | 具名拒或 ok（task-214 批 3 补参（形状取自测试 vmu-handover.test.mjs:27 `open({from,to})`）：补参前实测具名拒 **VMU_INVALID_ARGUMENT** ⇒ 补参后应见放行 ⇒ 已放宽为"具名拒或 ok" ✓） |
| `human` · `list()` | array[0] | — | — | array 或 object（两侧都写清 ✓：**零声明下 `status()` ⇒ ok（object）**（vetoes: 0、approvals: 0 ✓；neverAllowsBySilence: true 自曝「onTimeout 默认 hold ⇒ 沉默绝不变成批准」 ✓，轮 224 实测）；**Round 3 新增 `queue()` ⇒ 零机制下返回 `array[0]`**（审批队列为空正是零机制的正确形状 ⇒ **空列表放行、不拒** ✓，与 `mathjobs.list()` 同判据）。★ 判据＝**列表面可读、不拒**；"队列为空"**不得**被读成"门已生效"（门由 `gate()` 的具名拒证明 ✓）） |
| `idempotency` · `list()` | ok | — | dropped=0 truncated=false | ok 或 object（列表/状态面放行 ✓；**显式 `absent` 只在去重操作上**（该操作需参数 ⇒ 探针见 NEEDS_ARGS ✓）） |
| `identity` · `status()` | ok | — | dropped=0 | ok 或 object（实测（轮 224）：零声明下 status() ⇒ **ok**（noIssuerListMeansNoCheck: true 自曝「空 issuer 列表＝完全不做校验」 ✓）；bindPrincipal ⇒ ok 且 binding: off（记录而不耦合 ✓）。**不拒** ⇒ 形状为 ok，而非具名拒 ✓） |
| `ids` · `status()` | ok | — | — | ok 或 object（实测（轮 2）：零声明下 status() ⇒ **ok**（唯一 id 分配面：无声明仍可读状态，**不拒** ✓）） |
| `index` · `status()` | object | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `ip` · `list()` | ok | — | enforced=[1] fired=[0] dropped=0 enforcedScope=evaluated-so-far truncated=false | ok 或 object（实测 `list()` ⇒ **ok**（`enforced=[1] fired=[0] dropped=0` ⇒ 清单可读、**不拒** ✓）） |
| `latex` · `check()` | refusal | VMU_EXTERNAL_UNAVAILABLE | — | 具名拒（带 code）（PHASE 7：无 spawn 接缝 ⇒ `check()` 具名拒 VMU_EXTERNAL_UNAVAILABLE（本面绝不假跑）；有接缝才建面） |
| `lean` · `submit()` | refusal | VMU_LEAN_STATEMENT_REQUIRED | enforced=[0] enforcedScope=evaluated-so-far | 具名拒（带 code）（task-214 实测：`submit()` ⇒ 具名拒 **VMU_LEAN_STATEMENT_REQUIRED** ⇒ 零机制＝无命题文本 ⇒ 具名拒即真实形状 ✓） |
| `library-policy` · `registerVocabulary()` | ok | — | enforced=[2] fired=[0] | EXPECT_NA（非服务模块（无 `status()`；返回六个纯检查器 ✓）—— 行为由调用它的 library 套件覆盖 ✓） |
| `library` | create 抛出 | — | — | PROBE_NEEDS_ARGS（缺：库引用（ref/uri）） |
| `lifecycle` · `stages()` | refusal | VMU_LIFECYCLE_NOT_DECLARED | — | 具名拒（带 code）（task-214 实测：`stages()` ⇒ 具名拒 **VMU_LIFECYCLE_NOT_DECLARED** ⇒ 零机制＝未声明生命周期 ⇒ 具名拒即真实形状 ✓） |
| `loader` · `status()` | object | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `mailbox` · `list()` | ok | — | — | ok 或 object（实测（轮 2）：零声明下 plan() ⇒ **ok**（自曝 enforced=[1] ⇒ 投递计划可读、**不拒** ✓）；无收件人⇒无可投递对象 ✓） |
| `math` | create 抛出 | — | — | PROBE_NEEDS_ARGS（缺：数学请求体） |
| `mathadapters` · `plan()` | refusal | VMU_MATH_INVALID_INPUT | enforced=[2] enforcedScope=evaluated-so-far | 具名拒（带 code）（实测（轮 2）：零声明下 plan() ⇒ 具名拒 **VMU_MATH_INVALID_INPUT**（零机制＝无适配请求 ⇒ **具名拒即真实形状** ✓；不假装成功 ✗）） |
| `mathjobs` · `list()` | ok | — | dropped=0 | ok 或 object（**两侧都写清** ✓（★ 轮 4 更正读数 ✗✓）：**状态/列表面 `list()` ⇒ `{ok:true,count:0,dropped:0,jobs:[]}`（object 信封；零机制＝无作业 ⇒ 空列表放行 ✓）**；`submit()` 缺参 ⇒ 具名拒 **VMU_MATH_INVALID_INPUT**（task-214 实测，保留 ✓）。★★ 为什么改：轮 2 这行写"`list()` ⇒ array[0]"，而**当时探针没有固定 op**（`mathjobs` 同时有 `submit`/`list`，谁先匹配谁被调）⇒ 那个形状可能来自另一个方法、也可能是模块自身的形状变化 ✗ ⇒ 本轮**固定探针 op＝`list`**（见 `PROBE_ARGS.mathjobs`）后按**实测**改写；`submit` 的具名拒仍由既有 task-214 断言守着 ✓） |
| `mathtools` · `plan()` | refusal | VMU_MATH_INVALID_INPUT | enforced=[0] enforcedScope=evaluated-so-far | 具名拒（带 code）（task-214 实测：`plan()` ⇒ 具名拒 **VMU_MATH_INVALID_INPUT**（带口径 `enforced=[0] enforcedScope=evaluated-so-far`）⇒ 零机制＝无计划入参 ⇒ 具名拒即真实形状 ✓（补参后应见 `ok + enforced:[]`，届时改"具名拒或 ok" ✓）） |
| `meeting` · `status()` | object | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `meetingdomain` · `read()` | refusal | VMU_NO_SUCH_OBJECT | — | 具名拒（带 code）（轮 31 从 `meetings.js` 抽出（11 个严格域：读取侧具名拒，不再静默夹取；`meetings.js` 1199→1196，被顶满的文件**下降**）。**实测零机制形状**：工厂 `createMeetingDomains({clock})`（**不注入任何接缝**）仍能建（表是纯的、11 键回落声明默认值）⇒ 探针调 `read()`（无参 ⇒ 问一个未声明键）⇒ **具名拒 `VMU_NO_SUCH_OBJECT`**（"no declared domain for undefined"）⇒ 零机制＝"**问我没声明过的东西就具名拒**"，不静默 `null`、不臆造默认值 ✓。★ 期望词表是**闭集**：本行取闭集里的 `具名拒（带 code）`（实测 `shape=refusal` ＋ `VMU_NO_SUCH_OBJECT` 与之逐字对应；`judge()` 判"无名拒"为红）。） |
| `meetinglapse` · `lapseDue()` | op 抛出 | — | — | PROBE_NEEDS_ARGS（R12 拆出（`createMeetingControls`）；`lapseDue()` 缺参数即抛 ⇒ 探针需要参数才能裁定（同上）） |
| `meetingleave` · `requestLeave()` | op 抛出 | — | — | PROBE_NEEDS_ARGS（R12 拆出（`createLeaveControls`）；`requestLeave()` 缺参数即抛 ⇒ 探针需要参数才能裁定（登记为待补参数，而不是"无需裁定"）） |
| `meetingmarker` · `status()` | object | — | — | ok 或 object（轮 11 从 `meetings.js` 抽出（F51 标记族：域派生/耐久接缝/读面/自曝；`meetings.js` 1244→1198 ✓）。**实测零机制形状**：工厂 `createMeetingMarker({clock})`（**不注入 `durable`**）⇒ 首个零参操作 `status()` 回 **object**，其中 **`bound:false`／`durableMarker:false`** 自曝、**不声称任何"开着"的会** ✓ ⇒ 零机制＝"**没有域接缝就明说自己没有**"，而不是假装有 ✓（有 `create*` 工厂 ⇒ 不适用 EXPECT_NA）。★ 期望词表是**闭集**：我先写裸 `object` 被判 mismatch（fail-closed ✓），必须用词表里的 `ok 或 object`。） |
| `meetings-defaults` | （无 create* 工厂） | — | — | EXPECT_NA（R21 拆出（纯数据：WIRED_KEYS／UNWIRED_REASONS／reasonFor／DEFAULTS，无 `status()`、无 `create*` 工厂 ⇒ 不适用 ✓）—— 行为由 vmu-meetings／vmu-meeting-parity／vmu-meeting-domain 套件覆盖 ✓） |
| `meetings` · `open()` | ok | — | enforced=[0] enforcedScope=evaluated-so-far | 按声明默认开成（零机制＝按声明默认值开成（不拒）✓） |
| `meetingverdict` · `status()` | ok | — | — | ok 或 object（PHASE 12 实测：无参 `status()` ⇒ **ok**（零机制＝无裁决 ⇒ 放行 ✓）；`aggregateVerdicts([])` 的具名拒（空集不是 0）属输入错误形状、不登记为零机制 ✓） |
| `memberface` | （无 create* 工厂） | — | — | EXPECT_NA（纯谓词模块（**无 `create*` 工厂、无服务** ⇒ 矩阵不适用 ✓）；phase 12「座位→工具面」闸新增（非抽取）：`resolveFace`／`faceGate`（`VMU_TOOL_NOT_IN_FACE` 具名拒）／`hiddenNames`（`toolsView.hidden[]` 的目录）。零机制（`faces=null`）⇒ `{ok:true}`＝"没人声明就无物可执行 ⇒ 放行"，与其它 EXPECT_NA 行同形 ✓ —— 行为由 `tests/vmu-member-face.test.mjs` 覆盖 ✓） |
| `members` · `status()` | object | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `memory` · `record()` | ok | — | — | ok 或 object（task-204 实测（形状取自测试 vmu-memory.test.mjs:63）：`record({kind,text,by,evidence})` ⇒ **ok**（零机制＝有默认 scope、放行 ✓）） |
| `metrics` · `status()` | ok | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `migration` · `plan()` | refusal | VMU_COMPAT_MATRIX_MISSING | enforced=[6] fired=[1] enforcedScope=evaluated-so-far | PROBE_NEEDS_ARGS（缺：迁移计划入参（`from`／`to`／`backend`／`steps` ✓）；**作者已导出带完整 args 的 `GATE_SCENARIOS`** ⇒ 下一批补参时应可直接实测 ✓（**键数由本生成器实测输出**、**零新码**、全部返回型拒绝 ✓）） |
| `minutes` · `list()` | ok | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `notify` · `list()` | ok | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `pack` · `plan()` | refusal | VMU_PACK_MISSING | — | 具名拒（带 code）（第 26 轮已修 ✓：实测拒绝带 **`VMU_PACK_MISSING`**（曾误标"不带 code" ✗）） |
| `panel` · `status()` | ok | — | dropped=[object Object] | ok 或 object（实测（轮 2）：零声明下 status() ⇒ **ok**（自曝 dropped 列表 ⇒ 零机制＝无成员面板可报 ⇒ 状态可读、**不拒** ✓）） |
| `paper` · `start()` | ok | — | — | 具名拒或 ok（轮 135 实测：`start()` 无参 ⇒ 具名拒 **VMU_INVALID_ARGUMENT**（缺标题／章节／**无主章节**／编辑 ✓ —— 缺参即其零机制真实形状 ✓）；`PROBE_ARGS.paper` 带参后应见 **ok**（开篇不需要任何设置 ✓）⇒ 两态皆合规 ✓） |
| `partnership` · `list()` | object | — | — | ok 或 object（实测（轮 276）：零声明下 status() ⇒ ok（entities=0、zeroMechanism=true 自曝 ✓）；validateInvoice() 对**缺声明的税务字段位【逐位点名】**并拒（VMU_TAX_FIELD_MISSING）；绑定未登记实体拒（VMU_ENTITY_UNKNOWN）✓） |
| `projmigrate` · `status()` | ok | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `publication` · `advance()` | refusal | VMU_VERSION_CHAIN_BROKEN | — | 具名拒（带 code）（task-214 实测：`advance()` ⇒ 具名拒 **VMU_VERSION_CHAIN_BROKEN** ⇒ 零机制＝无版本链可推进 ⇒ 具名拒即真实形状 ✓） |
| `ratelimit` · `status()` | object | — | dropped=0 | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `receiptbounds` | （无 create* 工厂） | — | — | EXPECT_NA（纯函数工具模块（**无 `create*` 工厂** ⇒ 矩阵不适用 ✓）；轮 32 从 `host.js` 抽出（该文件 **1231 行越过 1200** ⇒ 抽取，**未往 `KNOWN` 加名字** ✓，`host.js` 1231→1151）：回执尺寸契约 `MAX_TOOL_RESULT_BYTES` ＋ **结构内、路径级**省略 `boundedToolResult(value)`（**不动键、不动数组长度**；其形状与 `elided:[{path,from,to,bytes}]` 由 `tests/vmu-receipt-truncation.test.mjs` 覆盖 ✓）。） |
| `records` · `put()` | ok | — | enforced=[10] fired=[0] enforcedScope=evaluated-so-far | ok 或 object（task-204 实测（形状取自测试 vmu-records.test.mjs:103）：`put({track,kind,title,body,settled:true})` ⇒ **ok**（零机制＝无配额限制、放行 ✓）） |
| `recruit` · `status()` | object | — | dropped=0 | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `registry` · `status()` | object | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `replay` · `plan()` | ok | — | truncated=[object Object] | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `report` · `status()` | ok | — | enforced=[11] truncated=0 | ok 或 object（实测（轮 2）：零声明下 status() ⇒ **ok**（自曝 enforced=[11]、truncated=0 ⇒ 汇报面可读、**不拒** ✓）；无可汇报内容时仍给形状而非拒 ✓） |
| `reportfeedback` | （无 create* 工厂） | — | — | EXPECT_NA（纯函数工具模块（**无 `create*` 工厂** ⇒ 矩阵不适用 ✓）；轮 8（第二阶段 A1 第一步）**新增**（非抽取）：报告反馈回路的纯函数 —— `REPORT_FEEDBACK_MAX_BYTES = 65536`（★ 宿主先例，非我们发明，且宿主不替我们强制）／`REPORT_FEEDBACK_CONTEXT_ORDER = 5000`（**显式有限数字**，不发明槽名）／`assertFiniteOrder`（我们补宿主缺的校验）／`reportFeedbackReceipt`（**9 键恒存在**、空态用值表达）／`reportFeedbackFailure`（复用已登记码 `VMU_EXTERNAL_UNAVAILABLE`）／`boundFeedback`（截断**自述**）。★ **Part A＋Part B 都已落**：设置键已在 `settings/schema.js` 声明，并被 `kernel/report.js` 的 `cfg()` **真读**（两处 `sget` ⇒ 这才是"有人读"的证据，不是 `LIVE_READERS` 那行），回执**恒带 9 键**；★★ **投递已接线**：入口 `vibe-math-vmu.js` 在 `:797` 那个 `if` **之外**调 `deliverReportFeedback(...)`（★ 抽取到 `kernel/reportfeedbackdelivery.js`，因为入口文件当时已 **1205 行越过 1200**），★ 并做**四种具名结局**：开关关＝零机制不编造失败／**开关开而受众为空＝具名失败 `report.audience`**（该键的 `doc` 自己承诺过）／宿主不可达或无 `.context`＝具名失败复用 `VMU_EXTERNAL_UNAVAILABLE`／否则 `delivered:true`。★ 投递文本是**运行时快照**（含 audience 与计数，并写明"不是指令"）——★ 因为写进提示词 section 会**重新污染 P**。） |
| `reportfeedbackdelivery` | （无 create* 工厂） | — | — | EXPECT_NA（纯函数式模块（**无 `create*` 工厂、无服务、无可探针物** ⇒ 矩阵不适用 ✓）；轮 13（第二阶段 A1 第一步 Part B）**新增**（★ 从 `vibe-math-vmu.js` **抽取**：该文件加完此块后 **1205 行越过 1200** ⇒ 抽取，**未往 `KNOWN` 加名字** ✓，入口 **1205→1148**）：报告反馈回路的**投递调用** —— 一个导出函数 `deliverReportFeedback({ ctx, effect, status })`，四种具名结局（关＝零机制／**开而受众为空＝具名失败**／宿主不可达或无 `.context`＝具名失败／否则 `delivered:true`），★ 投递文本是**运行时快照**且明写"不是指令"。） |
| `repropack` · `build()` | refusal | VMU_MATH_SEED_REQUIRED | — | 具名拒（带 code）（task-214 实测：`build()` ⇒ 具名拒 **VMU_MATH_SEED_REQUIRED** ⇒ 零机制＝无复现种子 ⇒ 具名拒即真实形状 ✓） |
| `resource` · `status()` | ok | — | — | ok 或 object（仪器面：零机制 ⇒ **台账可读、不拒**（`status()` 返回 `ok:true` ＋ `partition` ✓）；**键数由本生成器实测输出** ✓（note 只写形状与理由 ✗）） |
| `resume` · `status()` | ok | — | — | PROBE_NEEDS_ARGS（缺：`store`／`work`／`control`／`identity` 注入（工厂需要真实接缝才返回实例）；补参后应按实测形状裁定 ✓） |
| `resumeflush` | create 抛出 | — | — | PROBE_NEEDS_ARGS（R10 拆出（`createExitContract`）；实测 `createExitContract({})` 抛 "needs a snapshot({key}) writer" ⇒ 工厂需要注入接缝，探针需参数才能裁定（由 R12 的顺序修正当场抓出）） |
| `retention` · `plan()` | object | — | dropped=0 | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `reviewers` · `status()` | ok | — | — | ok 或 object（实测（轮 279）：零声明下 status() ⇒ ok（reviewers=0、zeroMechanism=true 自曝 ✓）；assign() 对【已声明冲突】具名拒（VMU_COI_VIOLATION）、对【达并发上限】具名拒（VMU_REVIEWER_OVERLOADED）；盲评解绑无理由拒（VMU_BLIND_UNBIND_DENIED）✓） |
| `rules` · `status()` | object | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `scheduler` · `list()` | ok | — | dropped=0 truncated=false | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `script-bridge` · `plan()` | refusal | VMU_INVALID_ARGUMENT | — | 具名拒（带 code）（第 26 轮已修 ✓：实测拒绝带 **`VMU_INVALID_ARGUMENT`**（同上 ✗）） |
| `settings-defaults` | （无 create* 工厂） | — | — | EXPECT_NA（非服务模块（纯读取器：`settingDeclaration`／`declaredDefault`／`readSetting`，无 `create*` 工厂、无 `status()` ⇒ 矩阵不适用 ✓）—— 行为由 `tests/vmu-kernel.test.mjs` 的 P0-fallback 段覆盖四扇门 ✓） |
| `skills` · `list()` | ok | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `stateversion` · `check()` | refusal | VMU_COMPAT_UNKNOWN_COMBO | — | 具名拒（带 code）（task-214 实测：`check()` ⇒ 具名拒 **VMU_COMPAT_UNKNOWN_COMBO** ⇒ 零机制＝无版本声明 ⇒ 具名拒即真实形状 ✓） |
| `store` | create 抛出 | — | — | PROBE_NEEDS_ARGS（缺：存储配置） |
| `storepolicy` · `status()` | ok | — | enforced=[0] fired=[0] enforcedScope=evaluated-so-far | ok 或 object（零机制 `status()` 实测 **ok**，自曝 `enforced=[0] fired=[0] enforcedScope=evaluated-so-far` ⇒ 策略面**可读、不拒** ✓；**本行探针之外另测**：真实 `write()` 缺 root ⇒ **返回型具名拒** `VMU_INVALID_ARGUMENT` 并列 `vmu.store.root` ✓（**键数由本生成器实测输出** ✓）—— 旧 note 曾写"status 带 backend/rooted/durable/remote" ✗，与实测不符，已按实测改写 ✓） |
| `tasks` · `list()` | array[0] | — | — | array（任务板：零机制 ⇒ 空列表（放行）） |
| `tenure` · `status()` | ok | — | enforcedScope=evaluated-so-far | ok 或 object（实测 `status()` ⇒ **ok**（`enforcedScope=evaluated-so-far` ⇒ 零机制**状态可读、不拒** ✓；**键数由本生成器实测输出**、**零新码** ✓）） |
| `timevalue` | （无 create* 工厂） | — | — | EXPECT_NA（纯函数工具模块（**无 `create*` 工厂** ⇒ 矩阵不适用 ✓）；它存在的原因是 `ms()` 曾在 `compliance`／`domaingate` **各有一份**（**两份实现会漂移** ✗✓ ⇒ 已抽为单一真源 ✓）） |
| `topology` · `list()` | ok | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `transaction` · `begin()` | ok | — | — | ok 或 object（task-204 实测（形状取自测试 vmu-transaction.test.mjs:62）：`begin({id,steps:[{service,apply,undo}]})` ⇒ **ok**（零机制＝无预算门、放行 ✓）） |
| `trust` · `list()` | ok | — | — | ok 或 object（状态/列表面：无声明 ⇒ 放行（不拒）） |
| `work` | create 抛出 | — | — | PROBE_NEEDS_ARGS（缺：工作项） |
| `workflow` · `advance()` | refusal | VMU_WORKFLOW_TRANSITION_REQUIRED | enforced=[7] enforcedScope=evaluated-so-far | 具名拒或 ok（**两侧都写清** ✓：`define({})` / `stages()` ⇒ 零机制**放行（ok）** ✓；被探 `advance()` 缺参 ⇒ **task-214 实测：具名拒 `VMU_WORKFLOW_TRANSITION_REQUIRED`（带口径 `enforced=[7]`）** ⇒ 具名拒即真实形状 ✓（旧 note 曾写 `op 抛出` ✗ / "缺参 ⇒ 具名拒" 混述 ✗，均已按实测改写 ✓）） |

=== ZERO-MECHANISM MATRIX: 105 modules, 0 mismatches, 0 unregistered, 0 EXPECT_UNDECIDED, 9 probe-errors, 10 n/a ===
<!-- END GENERATED: zero-mechanism-matrix -->

### 11.x 改文档的标准手法（★ 轮 524 补 ✓ —— ★ 本节在台账上结转了 6 轮 ✗）

> ★★★ **为什么要写下来**：★ **本会话在"改文档"上踩过的坑，全部是【锚点**]问题** ✗ ⇒ ★ **不写下来，下次还会踩** ✓。★ 三条手法，全部来自实测 ✓。

| 手法 | 怎么做 | 为什么（★ 实测的教训 ✓） |
|---|---|---|
| ★★★ **锚点先读形状** | 写正则之前，**先把那一行打印出来看**（★ 缩进、行尾、是否一整条长行 ✓） | ★ **试过 4 空格 vs 实际的 2 空格** ✗；★ **试过锚在【行首**]而签名是一整条长行、要紧的是**行尾** ✗ ⇒ ★★ **锚在行尾** ✓ |
| ★★★ **改完读回来自证** | 脚本写完文件**立即重新读盘**，断言：内容出现、行数增长 = 块长、前缀未变；★ **任一不满足就【回滚并拒绝**]** ✓ | ★ **一次误插产生 `if (taskTool, minutesTool)`** —— ★ **这是合法 JS ✗、语义静默地错** ✓ ⇒ ★★ **只有断言能抓** ✓ |
| ★★★ **含中文/引号的长文本走"块文件"** | 把要插入的文本**写成 D 盘的 `.txt`**，再用**行号**拼进目标文件 ✓ | ★ **在脚本里内联含引号的中文，本会话失败过 6 次以上** ✗（★ 单引号/双引号互相吃掉 ✓）⇒ ★★ **块文件法一次没错过** ✓ |

> ★★ **两个已入库的工具** ✓：
> - ★ **`scripts/insert-verified.mjs`** ✓ —— ★ **自验证插入器**：★ 它插完**读回**、断言"增长量 = 块长、锚点下标、前缀不变"，★ **任一不满足就【不写**]并返回 `{ok:false, why:…}`** ✓（★ 自带自检：`{ok:true,at:11,grew:2}` 与 `{ok:false,why:'no anchor line matched'}` ✓）；
> - ★ **生成区不可手改** ✓ —— ★ `<!-- BEGIN GENERATED: id -->` … `<!-- END GENERATED: id -->` 之间的内容**由生成器拥有** ✓ ⇒ ★★ **本会话两次手改生成区** ✗，**两次都被 `regen-all --check` / `audit-kernel-index` 当场抓出** ✓ ⇒ ★ **正确做法：改它的【真源**]（★ 例如模块的头部注释 ✓），再跑生成器** ✓。

### 11.y 两条纪律（★ 轮 528 补 ✓ —— ★ 都是本会话付过代价的 ✓）

| 纪律 | 内容 | 代价（★ 实测 ✓） |
|---|---|---|
| ★★★ **追加 ≠ 更新** | ★ **当条目是【移动**]的，必须【改写旧条目**]，而不是往清单里【再加一条**]** ✓ | ★★ **在 `installer.js` 与 `package.json#files` 里各犯一次** ✗ ⇒ **发行管道承诺发布两个已不存在的文件** ✗ ⇒ **4 个守卫报 ENOENT** ✓（★ 见 `docs/14` 的 4n 节 ✓） |
| ★★★ **"预算"不当理由** | ★ **若要中途停下，写"我选择在此停下，因为 X"** ✓；★ **不写"资源不够"** ✓ | ★★ 轮 526 我以"预算不足"为由**回滚了域合规降级** ✗ —— ★ **而轮 527 同一件事一次做完** ✓（★ **7 红 → 0** ✓）⇒ ★★ **它从来不是"做不起"，问题在记账** ✓ |

> ★★ **真正存在、值得一提的成本只有两个** ✓：★ **门禁的运行时间** ✓（★ 全量含 mutants 约 25 分钟 ⇒ ★ 故有 `vmu` 作用域与"如无必要不跑全量" ✓）与★ **"不留红树"** ✓ —— ★ **二者都是关于【验证的代价**]，**与"能不能继续做"无关** ✓。
> ★★★ **而验证的【分层**]** ✓：★ **改完即跑针对性套件**（★ 每个 0.1–15 秒 ✓，★ **红树的失败清单就是工作清单** ✓）；★ **每轮一次 `vmu` 作用域全跑**（★ 约 150–170 秒 ✓，★ 仓库规矩是"每次提交前必须全量" ✓）；★ **全量含 mutants 每 5 轮或发布前** ✓。

### 11.z 一条模式：**未决清单落后于代码**（★ 轮 531 补 ✓）

> ★★★ **模式**：★ **`docs` 里的"未实现／未定"标记，往往【比代码旧**]** ✗ —— ★ 本会话**三次**遇到，**每次都是清单错了、代码对** ✓。

| 轮 | 项 | 清单说 | 实测 |
|---|---|---|---|
| ★ 524 | `docs/22` 的 **O3／O4／O7／O9** | ★ "无／未定" ✗ | ★★ **都有载体** ✓（★ `rate` 368／`disclosure` 96＋`embargo` 25／`forecast` 35／`auditPack` 44 ✓） |
| ★ 529 | `docs/22` 的 **O6**（会计科目树） | ★ "已判降级" ✓ | ★★ **与此一致** ✓（★ 内核里 6 处 `accounting` 是**别的含义** ✓）⇒ **方向相反的一次：清单对、我怀疑错** ✓ |
| ★ 531 | `docs/22` 的 **O8**（人类在环） | ★ "未定" ✗ ＋ §10.5 标 `⛔` ✗ | ★★★ **已实现** ✓：★ `VMU_HR_AUTODECISION_FORBIDDEN` **有码** ✓、`humanDecisionRequired` **已接线** ✓、`tenure.js` **有拒绝点** ✓、★ 且"无人在场"的语义 **`onTimeout:'hold'`** ✓ |

> ★★★ **由此得出的纪律** ✓：★ **核一个"未决项"时，先读代码，再看清单** ✓ —— ★ **顺序反过来就会得出错误结论** ✓（★ 我轮 524 就差点按清单去"实现"已经有的东西 ✗）。
> ★★ **一条相反的经验同样重要** ✓：★ **清单说"已降级"时，也要核** ✓ —— ★ 轮 529 的 `accounting` **6 处命中看似可疑** ✓，★ 而**读进去才发现是别的含义** ✓ ⇒ ★★ **两个方向都要落在【读到的证据**]上，而不是落在字面** ✓。
> ★★★ **于是本仓的"未决项"有三种状态，必须分清** ✓：★ **① 真未做** ✓（★ 如 O5，轮 530 才实现 ✓）；★ **② 已做但清单未更** ✓（★ O3／O4／O7／O8／O9 ✓）；★ **③ 清单已对但看着可疑** ✓（★ O6 ✓）。

### 11.aa 测试纪律：**失败形状要全覆盖**（★ 轮 533 补 ✓ —— ★ 代价是一个真 bug ✓）

> ★★★ **纪律**：★ **"服务会拒"这件事有【两种形状**]** ✓ —— ★ **① 同步 `throw`** ✓；★ **② 返回的 promise 【拒绝**]** ✓。★ **只测前者会漏掉后者** ✓，★ **而漏掉的后果是【工具对失败报成功**]** ✗ —— ★ **比报错更坏** ✓。
>
> ★★★ **本仓付过的代价** ✓：★ `vibe_vmu_bridge` 的 `run` **async 且 reject** ✗，★ 而工具**没 await** ✗ ⇒ `Object.assign({…}, promise)` = 只有 `{ok,action}` ✓ ⇒ **对一次失败的调用报成功** ✗；★ **而前九个工具的 spy 全是同步 throw** ✗ ⇒ **十个测试都看不见它** ✓。
>
> ★★★ **由此定的做法** ✓：★ **① 每个工具的验收都要有【两种形状**]** ✓；★ **② 加一条【整类**]守卫** ✓（★ `tests/vmu-tools-await-rejections.test.mjs` ✓）：★ **用【只有那一个服务会被替换成"每个方法都 async 拒绝"**]的真内核** ✓ 驱动**全部工具** ✓，★ 并**带对照断言**（★ 真内核下同样的调用**成功** ✓ —— ★ 否则它只是在测"一律拒" ✓）；★ **③ 服务调用【一律 await**]** ✓ —— ★ **`await` 一个非 promise 是无害的** ✓ ⇒ ★★ **这一类问题整体消失，而不是逐个修** ✓。
>
> ★★ **一条副产品** ✓：★ 那次"整类守卫"第一版**用 Proxy 替换了【整个内核**]** ✗ ⇒ ★ **进程以未处理拒绝退出 1** ✓ ⇒ ★★ **查出来是 `toolSpecs()` 在【构建工具清单时**]读 `kernel.bus.status()`** ✓ —— ★ **"注册阶段会读服务"是一条值得知道的事实** ✓（★ 该方法是**同步**的，所以生产路径没问题 ✓）。

### 11.ab 纪律：**一个"检查模型"必须写清它的边界**（★ 轮 535 补 ✓ —— ★ 来自轮 534 的实测 ✓）

> ★★★ **纪律**：★ **任何"批量检查"都隐含一个模型** ✓ —— ★ **而模型有边界** ✓。★★ **边界必须【写下来 ＋ 带理由**]** ✓，★ 否则**豁免就变成漏洞** ✓（★ 读者无法区分"检查过了"与"跳过了" ✓）。
>
> ★★★ **本轮的例子** ✓：★ 整类守卫的模型是"**替换一个服务，看工具是否把拒绝带回来**" ✓ ⇒ ★ 它**只对"被检动作真的调用服务方法"的工具有效** ✓ ⇒ ★★ **14 个能驱动、5 个不能** ✓；★★ 而那 5 个**各有实测理由** ✓：★ `control` **调内核函数**（★ 没有服务可替换 ✓）、★ `turn`／`meeting` 的**被检动作读本地状态** ✓、★ `middleware` **触发条件是设置而非 flag** ✓、★ `pack` 的 loader 只经 `apply`／`unload` 到达 ✓。
>
> ★★★ **而关键在于：这个边界是【可证明**]的** ✓ —— ★ **那 5 个"动作从不调服务" ⇒ 【不可能**]丢掉一次服务调用** ✓ ⇒ ★★ **而"丢掉一次服务调用"正是该 bug 的唯一成因** ✓ ⇒ **豁免不是让步，是排除** ✓。
>
> ★★ **两条可操作的做法** ✓：★ **① 豁免表要写成【名字 → 理由**]的映射** ✓，★ 并**断言理由有实质长度** ✓（★ 本仓两处守卫生效：整类守卫与 `audit-enforced-consistency` ✓）；★ **② 边界要能被【重新测量**]** ✓ —— ★ 本轮的边界是**跑出来的**（★ 逐个替换服务、看谁失败 ✓），★ **而不是猜的** ✓。

### 11.ac 纪律：**"不存在"型断言必须带轮次**（★ 轮 537 补 ✓）

### 11.ad 巡检：**守卫"声称 vs 实做"**（★ 轮 537 抽样 ✓）

> ★★★ **动机** ✓：★ 轮 536 发现一个守卫**注释说它查某物、而代码从不读该物** ✗ ⇒ ★★ **推广去想：别的守卫会不会也这样？** ✓
>
> ★★ **做法与边界** ✓：★ **"声称 vs 实做"【不能完全机械判定**]** ✗（★ 需要语义 ✓）⇒ ★ **改为抽样**：★ 取**声称最具体、可核**的几个，★ **逐条读"声称句"与"对应条件"** ✓。
>
> | 守卫 | 它的声称 | 巡检结果（★ 轮 537 ✓） |
> |---|---|---|
> | `audit-code-size` | ★ "**每个记录在案的文件必须【仍然**]超限**" ✓ | ★ **成立** ✓（★ 该节确实重测每个记录项 ✓） |
> | `audit-claim-traceability` | ★ "**排除名单被断言非空**，故不得悄悄扩大" ✓ | ★ **成立** ✓（★ 断言在，★ 只是变量名与我猜的不同 ✓） |
> | `audit-artifact-docs` | ★ "**不得点名不存在的产物，且必须点名存在的**" ✓（★ 两向 ✓） | ★ **成立** ✓（★ 确有两向循环 ✓） |
> | `audit-cross-volume-refs` | ★ "**每个跨卷指针都能解析**" ✓ | ★ **成立** ✓ |
>
> ★★ **结论** ✓：★ **抽样的四个守卫【都做了它们声称的事**]** ✓ ⇒ ★ **轮 536 那个是【个例**]，★ 而非普遍** ✓（★ 但它仍值得制度：★ **改守卫时要读它的注释** ✓）。
>

> ★★★ **补充（★ 轮 539 ✓）**：★ **"不存在"型断言还有第二个陷阱：★ 它的【分母】也会变** ✗** ✓ —— ★ 例：★ `docs/28` 说"四个前缀在内核 **83** 个文件里全无提及" ✓，★ 而内核现为 **84** 个 ✓ ⇒ ★ **连"分母"都需要重测** ✓。★ 故写此类断言时：★ **① 带轮次** ✓；★ **② 带分母** ✓；★ **③ 复核时两个都要重测** ✓。

### 11.ae 纪律：**接线自检要检【条件形式**]，不只检"文本里有名字"**（★ 轮 539 补 ✓）

> ★★★ **代价** ✓：★ 轮 539 的接线脚本把 **签名形式**（`topologyTool = false` ✓）误用作**条件形式** ✗ ⇒ ★★ 产出 **`if (topologyTool = false)`** ✗ —— ★ **合法语法、永远为假** ✗ ⇒ **工具静默不注册** ✓。★ 而我的自检只查"文本里有 `makeTopologySpec({ param`" ✗ ⇒ **通过了** ✓。
>
> ★★ **这是第三次同类** ✓（★ 轮 517 的 `if (taskTool, minutesTool)` ✓；★ 轮 536 的"守卫不读它所声称之物" ✓）⇒ ★★★ **纪律**：★ **接线自检必须断言【条件是一个裸标识符**]** ✓（★ 正则 `if \(([a-zA-Z]+)\) \{` ✓），★ **并扫描全文件不得出现"单一等号的 if 条件"** ✓。

### 11.af 纪律：**生成区不可手改；写入者必读回**（★ 轮 543–544 合并 ✓）

> ★★★ **① 生成区不可手改** ✓：★ 本仓的生成区由 `<!-- BEGIN GENERATED: id -->` 界定 ✓ ⇒ ★★ **手写的行若落在生成区内，`regen-all --write` 会把它【重写掉**]** ✗ —— ★ **轮 543 实测** ✓：★ `docs/03` 的 `service-index` 是生成区 ✓（★ L1165–1246 ✓），★ 我插在其附近的行**被重生成覆盖** ✗ ⇒ ★★ **做法：插在生成区【之前**]，★ 且**先确认哪里是生成区** ✓。
>
> ★★★ **② 写入者必读回** ✓：★ 轮 542–543 我**两次**只 push 字符串、不读回 ✗ ⇒ **四个文档守卫同时变红** ✓ ⇒ ★★ **做法：每次写完【断言刚写的内容能读出来**]** ✓，★ 且**数量要对**（★ 如"表里现在 N 行" ✓）。
> ★★ **合并的理由** ✓：★ 两条都属于**同一件事** —— ★ **"我以为我改了"不等于"文件真的改了"** ✓。

### 11.ag 纪律：**"零调用点"要【递归**]搜完整棵树再说**（★ 轮 545 补 ✓）

> ★★★ **代价** ✓：★ 轮 543 我 grep 了 `packs/` ⇒ 说"通告缺注入" ✗；★ 轮 545 我 grep 了 `kernel/*.js` ⇒ 说"内核不读它" ✗ —— ★★ **两次都错** ✓，★ 而真相是 **`kernel/turn/index.js` 读了** ✓（★ 一个**子目录** ✓）。
>
> ★★ **做法** ✓：★ **① 用递归遍历，不用 `dir/*.js`** ✓；★ **② 结论里写明搜了哪些路径 ＋ 文件数** ✓（★ 如"递归 84 个 `.js`" ✓）；★ **③ 若要说"没人用"，★ 先确认真源不在【上一层或下一层**]** ✓（★ 本仓的模式恰恰是**声明在 pack、消费在 kernel、注入在插件** ✓）。
> ★★ **并记一条** ✓：★ **本仓已有守卫** `tests/vmu-seam-params-consumed.test.mjs` ✓ —— ★ **它把这件人工判断变成可跑的检查** ✓。

### 11.ah 纪律：**"不存在"的结论要【穷尽名字**]，★ 而度量不许被重构改动**（★ 轮 546 补 ✓）

> ★★★★ **一、穷尽名字** ✓：★ 轮 543–546 我**四次**用不完整的模式下了"没有消费者/没有生产者"的结论 ✗：
> | 我说的 | 漏掉的 |
> |---|---|
> | ★ "pack 里零调用点" ✗ | ★ **插件**（上一层 ✓） |
> | ★ "内核不读 `noticeBlock`" ✗ | ★ **`kernel/turn/`**（子目录 ✓） |
> | ★ "没人往队列放通告" ✗ | ★ **`notices.set`**（★ 我的模式只写 `notices.push` ✗） |
> | ★ "`fileURLToPath` 没导入" ✗ | ★ 我的检查匹配到了**用法**而非**导入** ✓ |
>
> ★★★★ **纪律** ✓：★ **① 搜【递归全树**]，★ 不在 `dir/*.js` 上下结论** ✓；★ **② 用【名字的多种写法**]（`x.set`／`x.push`／`x =`／`queueX` ✓）；★ **③ 找【导入**]要看 `import` 行，★ 不要匹配用法** ✓；★ **④ 结论里写明搜了什么模式、命中几何** ✓；★ **⑤ 若要说"没有人 X"，★ 先假设自己有漏，★ 再找【第三处**]** ✓（★ 本仓的模式恰是**声明在 pack、注入在插件、消费在 kernel 子目录** ✓）。
>
> ★★★★ **二、度量不许被重构改动** ✓（★ **而轮 549 **更正了本条的【事例**]** ✓）：★ 我轮 546 说"编辑那个测试 ⇒ V66 从 86% 变成 98%" ✗ —— ★★★ **事实是那一行【同时含两个数**]**：★ **总数 706／823 ＝ 86%** ✓、★ **纯散文 632／642 ＝ 98%** ✓ ⇒ ★★ **没有被改动** ✓。★★ **纪律仍然成立**（★ **度量的输入不是整理可以碰的** ✓），★ **但本条的【证据】要改成**：★ **"引用数要逐个点名"** ✓ —— ★ **一行里有两个数时，★ 我取了错的那个** ✗。★★ **纪律**：★ **"让清单更结构化"这类顺手的重构，★ 不能碰【度量的输入**]** ✓ —— ★ **要改就单独一轮、★ 并【重述度量口径**]** ✓。
> ★★ **并记** ✓：★ **V68（反向 27%）存在的意义正是"不能被自造文本抬高"** ✓ —— ★★ **而本轮说明它也同样防不住"改了输入集"** ✗ ⇒ ★ **故度量改动必须【明写并复核**]** ✓。

### 11.ai 纪律：**"陈旧标记"检测要区分【断言**]与【提及**]，且只报告不过门**（★ 轮 552 补 ✓）

> ★★★★ **代价（★ 本轮的险情 ✓）**：★ 我写了个检测"⛔ 命名的东西其实已存在"的脚本 ✓，★ 它报 **19** 处 ✓ ⇒ ★ **我批量替换了 13 处** ✗ —— ★★ **而其中多数是【正确的更正**]** ✗✓：★ `03:152` 本来就写着"✅ 已实现并已注册（轮 477 实测）" ✓，★ 那句里的 `⛔ 未实现` **是在解释它【从前**]说过什么** ✓；★ `12:100` 是**校正注记** ✓；★ `14:99` 是**计数** ✓ ⇒ ★★★ **批量替换把 13 处【正确的更正**]反转了** ✗ ⇒ **已【全部回退**]（★ `git checkout -- docs` ✓，★ 抽查确认原文恢复 ✓）。
>
> ★★★★ **两条纪律** ✓：★ **① 断言 ≠ 提及** —— ★ **行里出现标记词，不等于该行【主张**]未实现** ✓（★ 更正／引用／计数／规则都会提到它 ✓）⇒ ★ **故测试里的判据加了【更正词排除**]**（`此前／原写／曾在／更正／已过时` ✓）；★ **② 这类检查【只报告、不过门**]** ✓ —— ★ 实测：★ 排除后仍报 **13** 处 ✓，★★ **而逐条读完只有 4 处真陈旧** ✓ ⇒ ★★ **若做成门禁，会逼出 9 个错误编辑** ✗✓。
>
> ★★ **实现** ✓：`tests/audit-stale-markers.test.mjs` ✓ —— ★ **报告行数与内容，★ 不失败** ✓（★ 与 `audit-verbatim-claims` 同一模式 ✓）。

### 11.aj 守卫的设计要求：**朝着误报的方向设计，且"会咬"与"非空"必居其一**（★ 轮 565 定 ✓）

> ★★★★ **来由** ✓：★ 轮 562 发现一个【专为"未桥接钩子"而写**]的守卫**只认 `on: 'x'` 一种写法** ✗ ⇒ ★ **它绿着、★ 而一个随包 pack 的中间件是死的** ✓；★ 轮 563 又发现 `audit-hook-coverage` **只认单引号** ✗ ⇒ ★ 双引号／反引号会被**误判为"从未 emit"** ✓ ⇒ ★★★ **两条纪律由此定下** ✓：
>
> ★ **① 结构式检查要【朝着误报的方向**]设计** ✓ —— ★ **误报会被人发现并讨论 ✓，★ 静默放过不会** ✓✓。★ 实例：★ `vmu-tools-action-arity` 对**无法解析的写法【判违规**]** ✓（★ 而不是放过 ✓）—— ★ 代价是**约束风格** ✓，★ **但方向安全** ✓。
>
> ★ **② 每条结构式检查【必有其一**]** ✓：★ **一个"会不会咬"的自测**（★ 合成样本／植入探针 ✓）**或** ★ **一个非空／尺寸前提** ✓ —— ★★ **二者都没有的，★ 就是"可能空着却绿"** ✗✓。★ 实测：★ 全仓 **39** 个结构式守卫中，★ **6** 个明证会咬 ✓、★ **53 处**断言了尺寸 ✓ ⇒ **未发现空过实例** ✓。
>
> ★ **③ 粗筛只能产【候选】，★ 不能产【判决**]** ✓ —— ★ 轮 565 的粗筛给出 **3** 个候选 ✓，★ **而读一遍全部清掉** ✗✓（★ 一个用 `.size` 而非 `.length` ✓、★ 一个写的是"WOULD flag"而非"WOULD BITE" ✓）⇒ ★★ **凡"扫全仓找某种形状"的脚本，★ 写完先问："这个形状还有别的写法／字段名／措辞吗？"** ✓✓

### 11.ak 纪律三条（★ 轮 561／570／571／572 累计 ✓）

> ★ **① 目标里【列举的每一维**]都要【各自**]立一次检查** ✓（★ 轮 561 ✓）
> ★★ **来由** ✓：★ 目标里写着"含基础设施、可选功能、接口/插件、**可调控参数**、代理可执行命令、**脚本与协议**" ✓ —— ★ 我核过"存在／能用／能改" ✓，★★ **却漏核了"可调控"** ✗✓ ⇒ ★ **补核后发现 1152 个键、十面无空缺** ✓ ⇒ ★★ **纪律：★ 覆盖了"想到的那几维"不等于覆盖了【列表**]** ✓。
>
> ★ **② "某个量没变"【也可能是对的**]** ✓（★ 轮 570 ✓）
> ★★ **来由** ✓：★ 我立判据"跟着拒绝提示走后 code 必须变" ✗ ⇒ **它把 `budget.charge` 报成"说谎"** ✗✓ —— ★ 而实际是**两段式引导**（★ 第二个拒绝同 code、★ 但提示【更具体**]✓）⇒ ★★★ **纪律：★ 拿"可观察量变了"当证据前，★ 先问"它不变是否也合理"** ✓✓ —— ★ 因为**把合理的不变当缺陷，★ 会驱使人去改健康的机制** ✗✓（★ 与"错报真缺口"同族 ✓）。
>
> ★ **③ 适配层把参数转交给服务时，★ 要问"会不会把 `undefined` 变成 `null`"** ✓（★ 轮 571 ✓）
> ★★ **来由** ✓：★ `tools/minutes.js` 写 `minutes.actions(id || null)` ✗，★★ **而 JavaScript 的默认参数【只挡 `undefined`、★ 不挡 `null`**]** ✗✓ ⇒ **`{ id } = {}` 从 `null` 解构 ⇒ 泄露 V8 的 `"Cannot destructure … as it is null"`** ✓ —— ★ 而**同样写法在 `tools/` 里有 11 处** ✓，★ **只有 1 处泄露** ✓ ⇒ ★★ **差别在【服务端是否容得下 null**]** ✓ ⇒ ★★★ **纪律：★ 这类差别【只在实跑时才显形**]，★ 故要用【直调 null**]来探** ✓✓（★ 轮 572 已按此把其余 10 处探过，★ **0 泄露** ✓）。
>
> ★★ **三条的共同点** ✓（★ 也是本会话反复出现的族 ✓）：★ **"量法比对象窄／粗"** ✗ —— ★ 而**它的代价不是漏，★ 是错报** ✓ ⇒ ★★★ **纪律：★ 凡"扫全仓找某种形状／拿某个常量当判据"的脚本，★ 写完先问三句** ✓✓：
> 1. ★ **这个形状还有别的写法吗？**（★ 数组 vs 字符串／`.size` vs `.length`／`WOULD BITE` vs `WOULD flag` ✓）
> 2. ★ **这个常量是【谁的**]清单？**（★ `VU_HOOKS` vs `BRIDGED_HOOKS` ✓）
> 3. ★ **它不变，是否也合理？**（★ 同 code 但提示更具体 ✓）

### 11.al 纪律补遗：四条（★ 轮 574–587 累计 ✓）

> ★ **① "参数存在" ≠ "参数被用" ≠ "参数按对的顺序被用"** ✓（★ 轮 580／581／583 ✓）
> ★★ **来由** ✓：★ 11 个工具在 schema 里**声明了 `request`** ✓、★ **而派发时不传它** ✗ ⇒ **照文档读 schema 的调用方【完全无法**]供上服务要的字段名** ✓；★ 转发之后**又发现顺序错** ✗ —— ★ `{ ...request, id }` 里 **`id: undefined` 覆盖了 `request.id`** ✓ ⇒ ★★★ **纪律：★ 调用方的 `request` 放【最前**]、★ 显式参数**只在有值时**才带上** ✓✓；★ **而这三层只有【拿它调一次**]才分得出来** ✓。
>
> ★ **② 改不动就回退，★ 这是标准动作、★ 不是失败** ✓（★ 轮 581／582 ✓）
> ★★ **来由** ✓：★ 一次机械改写**弄坏了 6 处派发** ✗、★ **两次去片段都失败** ✗ ⇒ ★ **回退到已提交（★ 绿 ✓）＋ 把发现写下来** ✓ ⇒ ★★★ **"半个能用的重构 ＋ 一个失败的测试"不该上线** ✓✓。
>
> ★ **③ 正则改 JS 对象字面量【不可靠**]；★ 要【照抄行文本**]** ✓（★ 轮 581／583 ✓）
> ★★ **来由** ✓：★ `limits || {}` 里的 `}` **当场炸掉一处改写** ✗、★ **另外 6 处【静默**]炸掉、★ 只有测试发现** ✓ ⇒ ★★★ **规章：★ 要么按行重写、★ 要么【照抄那一行文本**]（★ 不靠模式 ✓）；★ **且改完立刻 `--check` ＋ 跑该文件的测试** ✓。
>
> ★ **④ 报"缺席"的扫描，★ 必须先证明它【看得见一行已知存在的**]** ✓（★ 轮 587 ✓）
> ★★ **来由** ✓：★ 我"回看还剩哪些节"的检查**报 §10 缺失** ✗ ⇒ ★ **而它一直在、★ 只是标题行【以 BOM 开头**]** ✗✓ ⇒ ★★★ **若照它行动，★ 会把已存在的一节再加一遍 ⇒ 【造出重复**]** ✓✓ ⇒ ★★ **纪律：★ 这类检查要【先自证**]（★ 在已知存在的一行上试一次 ✓）** ✓✓。
> ★★ **族内** ✓：★ 表格空行藏行 ✓、★ 标记写在更正句里 ✓、★ 名字在行内第二个 ✓、★ 钩子写成数组 ✓、★ 只认 `.length` 与某措辞 ✓、★ **行首 BOM** ✓ ⇒ ★★★ **共同点：★ 检查看得见的范围 ≠ 它以为的范围** ✓，★ **而代价【不是漏、★ 是错报** ✓（★ 会让去改健康的东西 ✓）。

### 11.am 纪律补遗：**五条，★ 全部来自"我错了"的场合**（★ 轮 591–600 ✓）

> ★ **① 先读、★ 先量，★ 再下结论** ✓（★ 本条最贵 ✓）
> ★★ **来由** ✓：★ 这一段的 **8 次假警报**里，★ **绝大多数是"先下结论、★ 后读代码"** ✗ —— ★ 例：★ 断言"pack 的中间件从不挂上"（★ 其实 M1 规则挂了 ✓）、★ "`middleware/` 模块没被装载"（★ 其实它是另一类东西、★ 逻辑活着 ✓）、★ "`PACK` 是陷阱"（★ 其实**故意的、★ 注释就在上方两行** ✓）。★★ **而每一次纠正都靠读或量** ✓。
> ★★★ **可操作的形态** ✓：★ **在看到一段代码【声称】某性质时，★ 先把它读出来** ✓；★ **在"这看起来不对"时，★ 先量它** ✓ —— ★ **因为本项目的注释【经常已经写明了理由**]** ✓✓（★ 三次都是 ✓）。
>
> ★ **② 改之前先量【爆炸半径**]** ✓
> ★★ **来由** ✓：★ 轮 596 —— ★ **"给提示词策略换个字段名"看起来是化妆式改动** ✗ ⇒ ★ 量了 `pack.js` 才发现 **`manifest.middleware` 会被直接交给总线、★ 而总线必须拒绝它** ✓ ⇒ ★★★ **于是同一个 diff 从"改名"变成"修复一个加载不了的 pack"** ✓✓ —— ★★ **若直接按"命名不符"去改，★ 会得到同样的 diff、★ 但记成一个化妆式改动** ✗。
> ★★★ **可操作的形态** ✓：★ **diff 之前，★ 先列出"谁会读到它"** ✓。
>
> ★ **③ 改完【读回来**]** ✓
> ★★ **来由** ✓：★ 轮 596 —— ★ 我的第一次编辑**把校验行插进了 `actions` 构造区** ✗（★ 那里**循环变量遮蔽了 manifest** ✓、★ 且**原来的动作行被替换**而不是并列 ✓）⇒ ★★★ **语法仍然合法、★ 门禁仍然全绿** ✗✓ ⇒ ★ **只有把那一段读出来才看见"动作行没了"** ✓✓。
> ★★★ **可操作的形态** ✓：★ **机械编辑之后，★ 不只是跑测试，★ 还要读回被改的那几行** ✓。
>
> ★ **④ 问运行时，★ 别重写它的规则** ✓
> ★★ **来由** ✓：★ 轮 597 —— ★ "pack 字段是否符合类别"这条检查，★ **最显然的做法是自己再实现一遍总线规则** ✗ ⇒ ★★ **而那也是最容易与"它要管的总线"【漂移**]的做法** ✓ ⇒ ★ **改为直接问 `bus.validateEntry`** ✓✓。
> ★★★ **可操作的形态** ✓：★ **判据要来自【被检查对象的自身接口**]，★ 不是它的影子副本** ✓。
>
> ★ **⑤ 让教训【可携带**]** ✓
> ★★ **来由** ✓：★ 轮 599 —— ★ `PACK`／`V5R_PACK` 的区分**写得很好、★ 但只活在【那个文件里面**]** ✗ ⇒ ★★ **不去打开它的读者（★ 包括我自己写的探针 ✓）会重复犯错** ✓ ⇒ ★ **把两侧断言写进检查，★ 让下一个读者不必打开它** ✓✓。
> ★★★ **可操作的形态** ✓：★ **一条只写在注释里的理由，★ 要同时【在一个会被读到的地方**]留下可断言的痕迹** ✓。

### 11.an 纪律补遗：**"改完又回来"是一个信号，★ 不是一次意外**（★ 轮 594／596／604 ✓）

> ★★★★★ **信号** ✓：★ **你修好一个缺陷，★ 而【一次重生成／一次规范化之后它又回来了**] ⇒ ★★★ **那说明缺陷【不在你改的那一层**]，★ 而在【生产那一层的那一层**]** ✓✓。
>
> ★★★★ **本会话三次** ✓：
> | 缺陷 | ★ 错的层 ✗ | ★ 对的层 ✓ |
> |---|---|---|
> | ★ **语料标题渲染成 `—— researcher r-1`** | ★ 改语料（★ 它会红漂移检查、★ 且不再算证据 ✓） | ★ **桥**（★ "录像变成运行期产物"就发生在那里 ✓） |
> | ★ **pack 的提示词策略让 `apply` 抛错** | ★ 改加载器（★ 它会撞上 `apply()` 已经加进去的条目 ✓） | ★ **清单**（★ 类别本来就是它写错的 ✓） |
> | ★ **表格行断成两行** | ★ 改文档（★ `--write` 下次就把它放回去 ✓） | ★ **生成器**（★ 它把一行源码当成了键名 ✓） |
>
> ★★★★★ **为什么"层"比"内容"重要** ✓：★★ **选错层时，★ 你会得到一个【看着合理、★ 却立不住**]的 diff** ✗✓ —— ★ 它**能过眼、★ 常常也能过门禁**，★ **但在下一次重生成／下一次规范运行时失效** ✓ ⇒ ★★★ **而"它又回来了"就是唯一的提示** ✓✓。
>
> ★★★★ **可操作的形态** ✓：
> 1. ★ **改之前先问：★ "这个东西是【谁生产**]的？"** ✓ —— ★ 若答案是"某个脚本／生成器／桥"，★ **那层才是要改的** ✓。
> 2. ★ **改之后若它回来：★ 不要去改第二遍** ✗ ⇒ ★ **把改动【往上挪一层**]** ✓。
> 3. ★★ **并且在那一层修完后，★ 重生成一次并确认它【不再回来**]** ✓（★ 本轮即如此：★ 短行 8 → 0 且重生成后仍为 0 ✓）。

### 11.ao 纪律补遗：**自查型守卫【必须另有独立判据**]（★ 轮 606–607 ✓）

> ★★★★★ **什么算"自查型"** ✓：★ **守卫拿"生产者的产出"与"生产者【自己会产出的东西**]"相比** ✓ —— ★ 例：★ **生成链的 `--check`** ✓（★ "我产出的 ＝ 我该产出的" ✓）、★ **快照比对** ✓（★ "现在 ＝ 上次记下的" ✓）。
>
> ★★★★★ **它的盲区（★ 轮 606 实测 ✓）** ✓：★★ **`regen-all --check` 在一个【真 bug 修复前后都是 14／14**]** ✗✓ —— ★ 因为那个 bug 是**生成器把源码当数据读**（★ `key: '…'` 匹配到模板表达式 ✓）⇒ **生成器每次都用同样方式产出同样的错东西** ⇒ ★★★ **"自洽"与"正确"是两件事** ✓✓。
>
> ★★★★ **所以规矩是** ✓：★ **一个自查型守卫只能证明"没有漂移"** ✓ ⇒ ★★ **它必须【另外**]配一个来自【独立事实**]的判据** ✓：
> | 自查型守卫（★ 证明"没漂移" ✓） | ★ 它的独立判据（★ 证明"是对的" ✓） |
> |---|---|
> | ★ `audit-generators-current`（★ 14/14 in sync ✓） | ★★ **结果量**：★ **生成物的【计数与内容**]（★ 如 1038 键／105 家族 ✓、★ 碎片不入 schema ✓） |
> | ★ `audit-gate-snapshot`（★ 与记录的快照比 ✓） | ★★ **那个人工复核过的快照本身** ✓ —— ★ 故**快照更新时要有人读过它** ✓ |
>
> ★★★ **可操作的形态** ✓：★ **写一个"与生产者比"的守卫时，★ 同时写下它【跟什么独立事实**]对齐** ✓ —— ★ **若写不出，★ 那它只能防漂移、★ 不能防错，★ 而它应当【这样说**]（★ 在名字或注释里 ✓）** ✓。
> ★★ **并记** ✓：★ **本轮我用关键词去分类 49 个 audit 检查，★ 结果【几乎全判成"有独立来源"**]** ✗ ⇒ **那个分类法【太粗、★ 不可用**] ⇒ ★★★ **而正确的读法是窄的：★ 只有 2 个真的"跑生成器并与文件比"** ✓✓（★ 即"量法比对象宽"这一次犯在了【分类**]上 ✓）。

### 11.ap 门禁豁免：**（共享模块）两处退避 sleep**（★ 轮 R5 登记 ✓，Lead 授权；`11.ad` 已被"守卫声称 vs 实做"占用，本节顺延为 `11.ap`）

> **这是哪一条门禁的豁免**：`tests/vmu-activity-timers.test.mjs` 的 F15 清单——**每个创建/清除全局定时器的文件都必须有分类与判决**；该套件把共享计算模块判为 `NAMED-FINDING-uncancellable`（§1 的分类行 ＋ §5 的具名探针），**本轮不去修它，而是把"为什么可以接受"写成权威登记**（豁免必须"名字 → 理由"，且边界**可被重新测量**，见 §11.ab）。

| 站点 | 结论 | 理由 ＋ 上界（可重测） |
|---|---|---|
| 共享计算模块的**版本探测退避**（第 616 行）与**包预检退避**（第 727 行）：`await new Promise(r => setTimeout(r, 250 + i*400))` | **具名豁免：无句柄 sleep 可接受** | ① 两处都在**有界重试**里：循环上限 **3 次**，退避 `250 + i*400` ms ⇒ **单站点上界 650 ms、整段 ≈1.8 s/引擎**；② **不持锁、不持进程、不跨调用**（没有可泄漏的资源，也没有可被占用的信号量）；③ 只有 spawn **已经失败**（timedOut／exit 为 null／未 spawned）之后才会走到，正常路径一次都不睡。 |

> **为什么不在本轮"加可取消接缝"**（这条必须写下来，否则豁免会被读成偷懒）：
> ① 共享模块是 **四份逐字节相同的副本**之一（跨预设约定），而本仓只有其中 **一份** 在写范围内 ⇒ 单独改它会**让四份协议分叉**；② 对照门禁现在含一条 **冻结的字节哈希断言**（canonical 快照），单改一份会**直接打红**那条断言，而它正是"语义级对照"之外的**最后一道冻结**；③ "宿主契约里加一个 timer 槽位"本身属于**跨预设接口变更**，需要四份同时改 ＋ canonical 快照刷新，属**下一轮的协调项**。
>
> **重测命令**（豁免的可证伪面）：`node tests/vmu-activity-timers.test.mjs` —— §1 必须仍把该文件分类为 `NAMED-FINDING-uncancellable`（**故意保持红**，它就是这条边界的证据），§5 的探针会重新测量两处 sleep 的存在；哪天四份副本一起加了接缝，**该分类行与本节必须同时删除**（不许留下过期豁免）。



> ★★★ **纪律**：★ **"X 在内核不存在／零实现／全无"这类断言，必须【写明它是哪一轮的实测**]** ✓ —— ★★ 因为**它随代码增长而自动失效** ✗，★ 而**没有任何守卫会因为它变假而变红** ✓。
>
> ★★★ **本会话的代价** ✓：★ **四次同类** ✓ —— ★ 轮 524（O3／O4／O7／O9"无"⇒ 实际都有载体 ✓）、★ 轮 529（O6 ✓）、★ 轮 531（O8"未定"⇒ 已实现 ✓）、★ 轮 536–537（`partnership` 全无 ⇒ **自轮 276 起就有** ✓；`review` 的 `rebuttal` ⇒ **存在** ✓；`docs/17` 的 S-2／S-5／S-6"零实现"⇒ **三支服务分别有 9／8／7 个方法** ✓；`docs/22` 的 O1"零实现"⇒ **与本卷 §1 自己的 12 行"已实现 ✓"矛盾** ✓）。
>
> ★★ **两条可操作做法** ✓：★ **① 写"不存在"时带轮次** ✓（★ 形如"★ 轮 NNN 实测：内核无 X" ✓）；★ **② 核实"不存在"要【问运行时**]** ✓ —— ★ 本轮的四处**全部靠一次运行时枚举**推翻 ✓（★ 而不是靠阅读 ✗）。
> ★★ **并记一条** ✓：★ **守卫只能守【结构】，守不了【断言的时效**]** ✗ —— ★ **"某事不存在"没有守卫能盯** ✓ ⇒ ★★ **只能靠【重测**]** ✓。

## 12. ★★★★★★ 轮 601–634 的纪律总表（★ **十五条，★ 全部来自"我错了"的场合** ✓）

> ★★★★ **为什么汇成一节** ✓：★ 它们原本散在 `11.al`／`11.am`／`11.an`／`11.ao` 里 ✓ ⇒ ★★ **引用时要翻四节** ✗ ⇒ ★ **这里给一份可点的总表** ✓；★ **各条的来由与可操作形态仍以原节为准** ✓。
>
> ★★★★★ **并记（★ 轮 627／631 ✓）** ✓：★★ **本表原先只列 8 行，★ 而下面又用散文记了 4 条** ✗ ⇒ **标题写"八条"、★ 表列 8 行、★ 而内容已有 12 条** ✗✓ ⇒ ★★★ **即一份"总表"【自己漂移了**]** ✓✓ —— ★ **故轮 627 把 9–12 补成表行** ✓；★★ **而轮 631 又补 13–14**（★ 索引停止生长 ✓、★ 位置型自指的两种坏法 ✓）⇒ ★★★ **本条【自己就是纪律 13 的实例**]** ✓：★ **每加一条，★ 就欠本表一行** ✓ —— ★ **故凡"索引型"文档，★ 都该问一句"最近新增的有没有进来"** ✓✓。
>
> | # | 纪律 | ★ 一句话 | ★ 它防的那个错 |
> |---|---|---|---|
> | ★ 1 | ★★ **先读、★ 先量，★ 再下结论**；★★ **且【读过的东西要用读过的结论**]** | ★ 看到代码**声称**某性质 ⇒ **先把它读出来**；★ **"这看起来不对"** ⇒ **先量它**；★★ **且当心【显眼的断言把判据引偏**]—— ★ 先问"那句话说的是【哪个对象**]"** ✓；★★★ **而【不要让正则去猜你已经读过的东西**]** ✓ | ★ 本段 **8 次假警报**里多数是**先下结论、★ 后读代码** ✗；★ **而三次里理由【已写在注释中**]✓；★★ **轮 636：★ §1 那句"缺一类就不算覆盖"很显眼** ✓，★ **而它讲的是【门禁系统的类覆盖**]；★ §2 讲的是【每条 R 的归属**]—— ★ **两张表、两个问题** ✓ ⇒ ★★ **差一点把 `E` 的缺席读成"缺一类"** ✗✓（★ 而 §2 自己写的读法警告【省掉了这次误判**]✓）** ✓；★★★ **轮 642：★ 我在轮 641【读过**] `audit-cross-volume-refs`、★ 知道它不递归** ✓，★ **而轮 642 我的正则把它判成"递归=Y"** ✗✓ ⇒ ★★ **即我的判据【比我已经读过的知识还不可靠**]** ✓✓ |
> | ★ 2 | ★★ **改之前先量爆炸半径** | ★ **diff 之前先列出"谁会读到它"** | ★ "换个字段名"其实是**"修复一个加载不了的 pack"** ✓ |
> | ★ 3 | ★★ **改完读回来** | ★ **机械编辑后，★ 不只要跑测试，★ 还要读回被改的那几行**；★★ **且要确认改的是【那个动作**]，★ 不是它的说明** ✓ | ★ 校验行插错位置 ＋ 原行被替换 ✓，★ **语法合法、★ 门禁全绿** ✗；★★ **轮 633：★ 修一个坏指针时，★ 我只把注记改成"已更正"、★ 而指针【仍指着旧号**]** ✗✓ ⇒ ★★★ **即"记录更正的注记" ≠ "更正"** —— ★ **而它【看起来更像修好了**]（★ 文本里出现了"已更正"字样 ✓）** ✓ |
> | ★ 4 | ★★ **问运行时，★ 别重写它的规则** | ★ **判据取自被检查对象的【自身接口**]，★ 不是它的影子副本** | ★ 影子副本最容易与**"它要管的对象"**漂移 ✓ |
> | ★ 5 | ★★ **让教训可携带**；★★ **且让【验证】可携带** | ★ **只写在注释里的理由，★ 要在一个【会被读到的地方**]留下可断言的痕迹**；★★ **而"我刚刚验过它"也要变成【一个断言**]，★ 不是一段叙述** ✓ | ★ `PACK`／`V5R_PACK` 的区分**只活在文件里面** ⇒ **我自己的探针都重犯了** ✗；★★ **轮 637 手工验过 `§2.1` 的 33 个作业存在** ✓、★ **而【无常驻守卫**]✗ ⇒ ★ **轮 640 补上** ✓（★ **"一次性探针拦不住下一次漂移"** ✓）；★★★ **而反例也在** ✓：★ `audit-cross-volume-refs` **910 处引用、0 未解析** ✓、★ **`--selftest` 证明它不能空过** ✓（★ 但**它的范围【不含 `docs/audit/`**]✗ ⇒ ★ **轮 625／633 我手工找到的那两处，★ 正落在它的范围之外** ✓）** ✓ |
> | ★ 6 | ★★ **改完又回来 ⇒ 该换一层** | ★ **它回来了⇒缺陷不在你改的层，★ 而在生产那一层的那一层** | ★ 语料标题（★ 该改桥 ✓）、★ pack 类别（★ 该改清单 ✓）、★ 表格断行（★ 该改生成器 ✓） |
> | ★ 7 | ★★ **自查型守卫必须另有独立判据** | ★ **"与生产者比"只能证明【没有漂移**]；★ 要证明【正确**]须另找独立事实**；★★ **而⑦ 与⑧ 要一起用** ✓ | ★ 生成链 `--check` 在一个**真 bug 前后都是 14／14** ✗ |
> | ★ 8 | ★★ **量法要与对象同宽**；★★ **而【守卫的范围**]也要与对象同宽** | ★ **"零命中"先问一句：★ "它抓不抓得到变体？"**；★★ **给⑦ 找的独立事实也要与对象同宽，★ 否则新判据会造出自己的假警报** ✓；★★★ **而"0 未解析"这类结论，★ 要连着问"扫了哪些"** ✓ | ★ 跳过 <3 行的块 ✓、★ 把"多一格"当"含管道符" ✓、★ 行首 BOM ✓、★ 关键词分类 49 个守卫 ✓、★ **全源计数（1152）比 schema-only 计数（1038）** ✓、★ **只收 H3／H4 标题 ⇒ 漏掉 H2 的 §1–§4，★ 于是 72 处引用被误报为悬挂** ✗✓；★★★ **轮 641：★ `audit-cross-volume-refs` 报"910 处、★ 0 未解析"** ✓，★ **而它 `readdirSync` 不递归 ⇒ 【`docs/audit/` 从不被扫**]** ✗✓ ⇒ ★ **我手工找到的那两处正在那里** ✓；★★★ **轮 642：★ 那个目录【从未被任何文档守卫提到**]** ✗✓ ⇒ ★★ **即"排除"分两种：★ 写明理由的（★ `14`／`28` ✓）与【按构造漏掉的**]（★ `docs/audit/` ✓）—— ★ 而后者才是会咬人的那种** ✓✓ |
> | ★ 9 | ★★ **只动标题的改动最需要读回来** | ★ **结构性改动语法不红、★ 门禁也不红** ⇒ ★ **必须读标题列表／层级树** | ★ 并节后子节没跟着改号（★ `15.1–15.4` 挂在 `### 11.` 之下 ✓）、★ 用数字编号与族头撞号（★ `## 11.` 与 `### 11.` ✓） |
> | ★ 10 | ★★ **有些性质不可机械审** | ★ 11.aj 那条（★ 每个结构检查要带会不会咬或非空前置 ✓）★ **只能读**，★ 或另找一个还没找到的结构判据 | ★ 关键词法说"22／22 都带" ✓、★ 节标题法说"10 里 2 个缺" ✗ ⇒ ★ **而读出来【都带**]** ✓ |
> | ★ 11 | ★★ **自动化放大错误后果 ⇒ 先确认口径** | ★ **把数交给生成器 ≠ 那个数就对了** ⇒ ★ **先读清"被替代的那个数是谁、算什么算出来的"** | ★ 标记账目报 **730／26919** ✗（★ 真值口径是 1364 ✓）、★ 读者标签报 **2** ✗（★ 文档是 65 ✓） |
> | ★ 12 | ★★ **删量要查指针** | ★ **撤掉一个量时，★ 可能留下【悬空指针**]，★ 而指针悬空时【什么都不会变红**]** | ★ `docs/00` 两行仍写"见上方派生块" ✗，★ **而块里已无该量** ✓ |
> | ★ 13 | ★★ **索引型文档会【停止生长**]，★ 而也可能【虚增行**]** | ★ **数字类漂移是"变旧"，★ 索引类漂移是"停止生长"** ⇒ ★ **每加一条，★ 就欠索引一行**；★★ **而"每加一条"只指【新的规则**]，★ 不指【新的实例**]—— ★ 实例应挂到已有行下** ✓；★★★ **反方向也要核：★ 每一行【都要有来源**]（★ 有行、★ 而无来源＝虚增 ✓）** ✓；★★★★ **而处方按【条目从哪来**]分** ✓：★ **能从磁盘／运行时【枚举**]的 ⇒ **建守卫**（★ 门禁直接红 ✓）；★ **靠【判断**]得来的 ⇒ **每轮问一次**（★ 无法机械判 ✓）** ✓✓ | ★ §12 标题"八条"、表 8 行、★ **而内容已有 12 条** ✗✓（★ 而 274 处"声称 N 条"里，★ **枚举在场的 4 处全一致** ✓ ⇒ ★ **这一类不普遍** ✓）；★★ **两次补全都发生在"我要引用它"的时候** ✓ ⇒ ★★★ **即索引的价值【在使用时才被检验**]，★ 不用的索引停止生长也无人察觉** ✓✓（★ 轮 634：★ "注记≠修复"本可加第 16 行 ✓，★ **而它是纪律③ 的实例 ⇒ 挂到③ 下、★ 不加行** ✓ —— ★ **否则索引会【按事件**]生长、★ 而不是按规则** ✗）；★★ **轮 635 量了反方向** ✓：★ **§12 的 15 行 ＝ 来源 11 条 ＋ 并记 4 条** ✓ ⇒ **既没停止生长、★ 也没虚增** ✓✓；★★★ **两个实例** ✓：★ **"全部卷清单"（★ 条目来自磁盘 ⇒ 有守卫 ✓ `audit-doc-index` ✓）**、★ **§12（★ 条目来自判断 ⇒ 只能每轮问 ✓）** ✓ —— ★★ **而轮 639／640 用这条处方【各找到一个真缺口**]✓** ✓✓ |
> | ★ 14 | ★★ **位置型自指有两种坏法** | ★ **"见上方／见下表"的对错【只在阅读时才知道**] ⇒ ★ **它比编号引用更脆** | ★ **①悬空**（★ 目标没了 ✓）、★ **②方向反**（★ 目标在、★ 而指示反了 ✓ —— ★ `docs/11` 说"见上方"★ 而目标在下方 ✓）⇒ ★★ **①不会被"目标是否存在"的检查抓住** ✗✓ |
>
> | ★ 15 | ★★ **批量机械编辑要先说清"不许碰什么"** | ★ **一个批量动作【总有会咬人的边界**] ⇒ ★ **先写出禁区，★ 再动手** | ★ 修"标题前缺空行"时，★ **在表行之后插空行会【截断表格**]、★ 撞硬门禁** ✗✓ ⇒ ★ **故禁区＝表行之后 ＋ 代码围栏内 ＋ 生成区内** ✓（★ 而生成区那条【被生成链自己抓住了**]✓） |
>
> ★★★★ **十五条的共同根** ✓：★★ **"检查看得见的范围 ≠ 它以为的范围"，★ 而代价通常是【错报**]而不是漏报** ✓ ⇒ ★ **所以每条的可操作形态都是"去看/去量那个具体的东西"，★ 而不是"要更小心"** ✓✓。
> ★★★ **并记** ✓：★ 其中 **1／3／6／7／9 是"层"的问题**（★ 读哪层 ✓、★ 改哪层 ✓、★ 验证哪层 ✓），★ **2／4／5／8／10／11／12／13／14／15 是"范围"的问题**（★ 谁读它 ✓、★ 判据来自谁 ✓、★ 谁看得到 ✓、★ 量得多宽 ✓、★ 口径是否同一 ✓、★ 索引是否跟上了 ✓、★ 指针是否还指对 ✓、★ 禁区写没写 ✓）⇒ ★★ **两类合起来正好覆盖本段所有返工** ✓。
>
> ★★★★★ **而"只动标题"的改动【最需要读回来**]** ✓（★ 轮 611–615 实测 ✓）：★★ **因为语法不会红、★ 门禁也不会红** ✗✓ ⇒ ★ **而它偏偏能造出两类尾巴** ✓：★ **并节后子节没跟着改号**（★ `15.1–15.4` 挂在 `### 11.` 之下 ✓）、★ **以及用数字编号与族头撞号**（★ `## 11. 附录` 与 `### 11.` ✓）⇒ ★★★ **两类都是【读标题列表／读层级树**]当场发现的** ✓✓ ⇒ ★★ **故纪律③ 在结构性改动上不是可选项，★ 而是唯一的检查** ✓。
>
> ★★★★★ **并记：★ 11.aj 那条（★ "每个结构检查要带会不会咬或非空前置"）【无法靠匹配词来审**]** ✓（★ 轮 617 实测 ✓）：★★ **同一性质、★ 同一轮、★ 两种机械判据给出了【方向相反的错误答案**]** ✗✓ —— ★ **关键词法说"22／22 都带"，★ 而抽查一个被标为"无前置"的，★ 发现它确实带**（★ 那一节叫 "it still refuses without a scope, and the refusal still guides" ✓）；★ **节标题法说"10 里 2 个缺"，★ 而读那两个，★ 两个也都带** ✓ ⇒ ★★★ **故结论是窄的：★ 这个性质【要么读、★ 要么另找一个我还没找到的结构判据**]，★ 而**不可据一个不可靠的审计去改检查**（★ 那是把绿检查弄弱的方式 ✓）** ✓✓。
>
> ★★★★★ **并记：★ 自动化会【放大**]错误的后果 ⇒ 故纳入生成器之前，先确认【口径**]** ✓（★ 轮 623–624 实测 ✓✓）：★★ 把数交给生成器 ≠ 那个数就对了** ✗ —— ★ 第一版生成块算了两个量：★ **"标记账目"**（★ 报 730／26919 ✓）与★ **"读者标签数"**（★ 报 2 ✓），★ **而文档里对应的是 1364 与 65** ✗ ⇒ ★★★ **查明两者都在量【另一个量**]**（★ 一个是全树字形数 vs 一次**按行分类**的扫描 —— ★ 数的是"点名了已存在对象的标记行" ✓；★ 一个是一个源文件里的出现次数 vs 桥的产出 ✓）⇒ ★★★★ **故结论** ✓：★ **一个带"派生"标签、★ 却量错口径的块，★ 比它所替代的手写副本【更坏**]（★ 标签让错的数看起来权威 ✓）⇒ ★★ **规矩：★ 生成之前先读清"被替代的那个数是谁、算什么算出来的"，★ 并【删掉**]算错的那段代码，★ 而不是留着不用** ✓✓。
> ★★★ **而改完还要【查指针**]** ✓（★ 轮 624 的实际收获 ✓）：★★ **撤掉一个量时，★ 可能留下【指向它的悬空指针**]** ✗ —— ★ 轮 623 撤掉标记账目后，★ `docs/00` 面表里那行仍写着"见上方派生块" ✓，★ **而块里已经没有它** ✗ ⇒ ★ **已改为指向 `audit-stale-markers`（★ 真正的产出者 ✓）** ✓✓。

## 13. ★★★★★ scope 词汇门禁：`audit-scope-role-vocabulary`（PHASE 7 轮 12）

★★ **缺陷（真机实测）**：`v5r-fixture-tools` 与 `v5r-tools-*` 段的 `scope.role` 写了**显示角色** `academician`／`researcher`，而回合的 `turn.role` 是**槽 id** `chair`／`member`／`temp` ⇒ **段永不渲染**；本地测试因为传显示名当 role 而一直绿 🔴 根因见 `kernel/turn/index.js` 的 `roleLabel` 注释（`role` 是绑定选择的 KEY，显示名在 `roleLabel`）。

★★ **判据（派生，不手写清单）**：对每个 pack 从 manifest 取**声明的槽 id**，从 pack 自身源码取**真正 dispatch 的 role/task**（`role:`／`task:` 字面量，以及 `*ROLES*` 常量数组），phase 取**内核 `TURN_PHASES` ∪ pack 自己的 phase**；每个 `scope.role`／`scope.phase`／`scope.task` 必须是这些集合的成员，否则红并指出段名／值／合法集合。`scope.member` 只做结构检查（通配或非空 id），**活性无法静态判定**，门禁显式标注这一点而不是假装通过。

★★ **自证**：`--selftest` 用合成段证明「显示名 `academician` 在 v5r 上必红」「槽 id `member` 绿」「派生集合非空」；默认跑两包，v5r 未修前应红，修后应绿。**作业数 +1**（写入门禁列表）。




## G7 门禁增量（PHASE 9+ / 真机教训）

- **错误码的 `hint` 不许为 `null`**：任何具名拒绝都必须带非空 `hint`（G7 抓到 `v5_pause/resume` 的 `hint:null`）；门禁在 `tests/audit-declaration-criterion.test.mjs` 与 `vmu-undefined-refusals.test.mjs` 的声明判据上收紧。
- **`-Faces` 未知名 ⇒ 具名拒**：`vmu.tools.faces` 里的未知面键/工具名必须报 `VMU_INVALID_ARGUMENT`（hint 列出已知面），不得静默忽略或静默全开。
- **`capacity:0 = unlimited`**：槽位容量 0 表示无上限，回执带 `unlimited:true`；门禁 `vmu-kernel` 断言 `capacity 0 ⇒ unlimited:true`、`capacity 1 ⇒ unlimited:false`。
- **`instructionDelivered`**：`step`/最终 turn 回执带该布尔，回答“本轮 `why` 指令是否进了装配文本”；无此字段不等于已交付。

> **历史引用声明（G5 H3）**：本卷提到的 `vibe-math-v2`／`v3`／`v4`／`v5`／`v5r` 路径与行号均为**历史源码引用**；这些 preset 已归档到 `archive/legacy-presets/`，不再作为可安装 preset 发布。
