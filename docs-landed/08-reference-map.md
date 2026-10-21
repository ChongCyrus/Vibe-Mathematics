# 08 · **查阅卷：文件地图／术语／反查／命令／错误码／同名不同物**

> ★ **这一卷解决的唯一问题**：★ **"我知道我想做什么，但我不知道【该看哪里】"** —— ★ 把**散在各卷的"查阅型"信息**集中成一页，★ **其它卷继续讲"为什么"**。
> ★ **铁律（本卷自守）**：★ **每个字段名／方法名／路径／行为，都在代码或文件里核过**（★ 核不到的**明写"未验证"**，见 §7）。★ **上游文档可能过期 —— 代码是事实** ✓
> ★ **本卷是 `docs-landed/` 的第 8 卷**（★ `07` 的"七卷"清单写于本卷之前 —— ★ 那是**当时**的事实，不改它，见 §6.4）✓

---

## 1. ★★ 文件/目录地图（★ 每个都回代码核过）

### 1.1 仓库顶层（`Vibe-Mathematics/`）
| ★ 路径 | ★ 一句话用途（★ 核过的依据） |
|---|---|
| `vibe-math-vmu/` | ★ **框架本体**（★ 能力在内核；见 §1.2）✓ |
| `docs-landed/` | ★ **定稿短版文档**（★ 8 卷；★ **本卷是第 8 卷**）✓ 实测 `docs-landed/*.md` = 8 |
| `docs/` | ★ **权威细节**：`vibe-math-vmu/docs/` 的**镜像卷**从不在顶层；顶层 `docs/` 放**架构图／审计清单／方法论／对比审计／论文** ＋ `acceptance/` ✓ 实测顶层 6 个 .md ＋ `acceptance/` |
| `docs/acceptance/` | ★ **过程与审计记录**（★ 逐轮报告／裁决／来源盘点）✓ 实测 **339** 份 `.md` |
| `vibe-math-v5r/`、`vibe-math-v5/`、`v4`、`v3`、`v2` | ★ **历史各代 preset（已弃用；见 `docs/DEPRECATED-LEGACY-PRESETS.md`）**：目录仍在仓内作历史参考，**不再出现在 package/installer 的发射面**（迁移与 parity 的对照面仍可读）✓ |
| `prompt-corpus-v5/`、`prompt-corpus-persona/`、`prompt-corpus-v2/`～`v4/` | ★ **提示词语料快照**（★ pack 提示词由它派生；v5 语料带 sha256 记录）✓ 目录存在 |
| `tests/` | ★ **套件与探针**（★ 门禁都在这里）✓ |
| `scripts/` | ★ **生成器与审计脚本**（★ 见 §4.3）✓ |
| `installer.js`、`cordis.patch.yml`、`preset-declaration.js` | ★ **安装/宿主接线用**（★ 注意：★ 它们在**仓库根**，**不在** `vibe-math-vmu/` 里，见 §6.2）✓ |
| `README.md`／`README.en.md`／`AGENTS.md` | ★ 总入口／英文版／**给 agent 的最短规矩入口** ✓ |
| `screenshots.json`、`示例图/`、`VibeMath/` | ★ 展示与素材（★ `VibeMath/` 内含 `Projects/`；★ **其具体用途本轮未验证** ⇒ §7）⚠️ |
| `vmu/`（顶层） | ★ **不是文档目录** —— ★ 实测它**只有一个 `audit/` 子目录**（★ vmu 文档在 `vibe-math-vmu/docs/`，见 §6.1）✓ |

### 1.2 框架目录 `vibe-math-vmu/`（★ 每个名字都是核过的）
| ★ 路径 | ★ 用途 |
|---|---|
| `kernel/` | ★ **能力面**：★ 回合循环／提示词管线／名册／会议／票箱／工具面服务… ★ 实测 **101** 个 `kernel/*.js` ＋ 两个子目录 `prompt/`、`turn/` ✓ |
| `tools/` | ★ **工具面**（模型能调用的那些 **face**）✓ |
| `settings/` | ★ **声明**：`schema.js` ＝ 可设什么／类型／域／默认／归属／热级 ✓ |
| `packs/` | ★ **整合包**：★ 实测 `packs/v5r/{index.js, notices.js, settings/, middleware/, prompts/}` ✓ |
| `host.js`／`host-deliver.js`／`host-hooks.js`／`host-math.js`／`host-spawn.js` | ★ **与宿主 DSH 的适配缝**（★ 装配发生在这里）✓ 五个文件均存在 |
| `vibe-math-vmu.js` | ★ **入口插件**（★ preset 装配在这里）✓ |
| `math-computation.js`／`math-engines.js` | ★ **共享 verbatim 数学模块**（★ 多份必须逐字节相同，改前先跑 parity 门禁）✓ |
| `preset.yml`／`agent.cordis.yml` | ★ preset 声明与 Cordis 接线 ✓ |
| `glossary.json` | ★ **术语表的单一真源**（★ `docs/01 §7` 的术语表由它生成）✓ |
| `extensions/` | ★ 扩展面 ✓ |
| `vmu/`（框架内） | ★ **框架内的 `vmu` 子目录**（★ 与顶层 `vmu/` **不是一回事**，见 §6.1）✓ |
| `docs/` | ★ **权威细节卷 00–29 ＝ 30 卷**（★ 实测 `vibe-math-vmu/docs/*.md` = 30）✓ |

---

## 2. ★★ 术语速查（★ 一词一句 ＋ 指向权威卷）

| ★ 词 | ★ 一句话 | ★ 权威 |
|---|---|---|
| **kernel（内核）** | ★ 只给**能力与挂点**，不含任何机构语义 ✓ | `docs/01-philosophy §1`／`docs/02-architecture` |
| **pack（整合包）** | ★ 一个文件夹＝**settings ＋ middleware ＋ prompts**（★ 本机构的一切偏好与策略都在这里）✓ | `docs/10-packs`／`docs/27-pack-folder` |
| **entry（入口）** | ★ 把框架接到宿主的那个插件（`vibe-math-vmu.js` ＋ `host*.js` 缝）✓ | `docs/02-architecture`／`docs/19` |
| **face（面）** | ★ **模型可调用的工具族**（★ 每个 face 有名字与动作；★ 由 `tools/` 注册）✓ | `docs/03-interface-contract`／`docs/18` |
| **hook（钩子）** | ★ **能在哪介入**的注册点；★ 单一真源＝`kernel/bus.js` 的 `HOOK_REGISTRY`（★ **数它别手抄**）✓ | `docs/05-middleware` |
| **scope（作用域）** | ★ 一个机制**生效的边界**（★ 声明式绑定或设置域的一部分）✓ | `docs/05-middleware`／`docs/04-settings` |
| **enforce／enforced** | ★ 该轮**真的被强制执行**的设置键集合（★ 回执里带 `enforced` 字段）✓ | `docs/18`／`docs/26` |
| **fired（开火）** | ★ 机制**本轮真的触发了**（★ 回执里 `fired` 与 `enforced` 分开）✓ | `docs/26-turn-orchestration` |
| **零机制** | ★ **默认什么都不开**：没有配置就只注册一个只读工具 ⇒ 一切动起来必须来自**声明** ✓ | `docs/01-philosophy`／`docs/02-architecture` |
| **惰性键** | ★ **已声明但当前没有消费者**的设置键（★ 三档读法：已接线／未接线／未判定 —— ★ 表由生成器给，★ 别手抄）✓ | `docs/04-settings §11` |
| **caller 通道** | ★ 交付模式之一：★ **成员回合由调用会话扮演**（`step` 返回 `awaiting` ＋ `memberPrompt`，★ 下次调用带 `reply`）✓ | `AGENTS.md §4`／`docs/18` |
| **binding（绑定）** | ★ 「段 × 谁用它」的声明（★ 角色/阶段/成员维度；★ 例：`CHARTER_ROLE_BINDINGS`）✓ | `docs/06-prompt-pipeline`／`docs/26` |
| **section（段）** | ★ 提示词的**一段**（★ 有名字与顺序区间；★ 装配时按区间排，不改内核）✓ | `docs/06-prompt-pipeline` |
| ⚠️ **track／slot／primitive** | ★ **未验证**：★ 任务单里列了这三个词，但**本轮未在代码里核到**它们的定义位置 ⇒ ★ **不写进本表**（★ 见 §7） | — |

---

## 3. ★★ "我想做 X → 看哪卷"（★ 使用者 ＋ 开发者）

| ★ 我想… | ★ 先看 | ★ 再深入（权威） |
|---|---|---|
| ★ **装起来、跑一次** | `docs-landed/02-running` | `docs/12-user-guide`／`docs/18` |
| ★ **知道"结题"到底怎么判** | `docs-landed/02-running §3` | `docs/01-philosophy`／`docs/26` |
| ★ **调一个参数（可设什么/默认/域）** | `docs-landed/03-extending §4` | ★ `docs/04-settings`（**生成表**） |
| ★ **造自己的机构（pack）** | `docs-landed/03-extending` | `docs/10-packs`／`docs/27-pack-folder`／`docs/29` |
| ★ **写中间件（四种形态）** | `docs-landed/03-extending §2` | `docs/05-middleware` |
| ★ **加/改提示词段** | `docs-landed/03-extending §3` | `docs/06-prompt-pipeline` |
| ★ **查某能力在不在、怎么做** | `docs-landed/06-coverage-map` | `docs/02`／`docs/09`／`docs/16`／`docs/17`／`docs/22` |
| ★ **查某个工具/动作/钩子的签名** | ★ 本卷 §2（术语）→ 再查 | `docs/03-interface-contract`／`docs/18` |
| ★ **查错误码含义** | ★ 本卷 §5 | `docs/18`（错误码速查）／`docs/03` |
| ★ **加一个测试/断言** | `docs-landed/04-verification §5` | `docs/11-gates-and-development` |
| ★ **知道它【没做成】什么** | `docs-landed/05-known-debt` | `docs/23`／`docs/14` |
| ★ **查文件该改哪里** | ★ 本卷 §1 | `docs/02-architecture`（模块表） |
| ★ **查文档之间什么关系、冲突信谁** | `docs-landed/07-index-and-relationship` | — |

---

## 4. ★★ 命令速查（★ 全部核到文件存在）

### 4.1 装 / 跑
| ★ 命令 | ★ 用途 |
|---|---|
| `node scripts/preflight.mjs` | ★ **T0 预检**（跑重门禁之前先跑它）✓ |
| `node scripts/dsh-drive.mjs …` | ★ **驱动一次真机会话**（★ 参数见 `docs-landed/02-running §2`）✓ |
| `node scripts/build-preset-rows.mjs` | ★ 构建 preset 行（★ 唯一写在 `package.json#scripts` 里的命令 `build:presets`）✓ |

### 4.2 验
| ★ 命令 | ★ 用途 |
|---|---|
| `GATE_SCOPE=vmu node tests/run-tests.mjs` | ★ **T1 全量门禁**（套件＋探针）✓ |
| `node tests/run-tests.mjs --counts` | ★ **作业计数的权威来源**（★ 文档里的数字由它派生，★ 不要手抄）✓ |
| `node tests/<name>.test.mjs` | ★ **跑单个套件** ✓ |

### 4.3 生成器 / 门禁（★ 改完派生面必须跑）
| ★ 命令 | ★ 用途 |
|---|---|
| `node scripts/regen-all.mjs --check` | ★ **派生面是否同步**（★ 改 `schema.js`／提示词后必跑）✓ |
| `node scripts/regen-all.mjs --write` | ★ **重写派生面**（★ `--check` 红且确认是自己的改动时才用）✓ |
| `node scripts/check-docs.mjs` | ★ **文档 lint**（★ 本卷也必须过它）✓ |
| `node scripts/generate-vmu-settings-table.mjs --write` | ★ 重生成 `docs/04 §11` 设置表 ✓ |
| `node scripts/generate-planned-settings.mjs --check` | ★ 计划键镜像是否与设计卷一致 ✓ |
| `node scripts/generate-kernel-index.mjs` | ★ 重生成 `docs/02` 内核索引 ✓ |
| `node scripts/generate-glossary-table.mjs` | ★ 重生成 `docs/01 §7` 术语表（源 `glossary.json`）✓ |
| ★ **全部生成器清单** | ★ **别手抄**：`ls scripts/generate-*.mjs` ✓ |
| ★ **全部门禁清单** | ★ **别手抄**：`ls tests/audit-*.mjs tests/audit-*.test.mjs` ✓ |

### 4.4 ★ 三条"改了会装不上/会漂"的硬规矩
1. ★ **新增文件** ⇒ 必须进 `package.json#files` **且** 进 `installer.js` 的 managed 清单（★ 否则**装完 MODULE_NOT_FOUND**，本地永远发现不了）✓（`AGENTS.md §3`）
2. ★ **改 `settings/schema.js`** ⇒ `generate-vmu-settings-table.mjs --write` ＋ `update-doc-counts.mjs` ＋ `regen-all.mjs --write`，再 `--check` ✓
3. ★ **改 `math-computation.js`** ⇒ 先跑 parity 门禁（★ 多份必须逐字节相同）✓

---

## 5. ★★ 最常撞到的错误码 → 你写错了什么

> ★ **只列本轮在代码里核到的**（file:line 见右列）；★ **完整清单不要手抄** —— ★ 用命令派生：
> `grep -rho "VMU_[A-Z0-9_]*" vibe-math-vmu/kernel | sort -u`（★ 实测有数百个；★ 权威说明在 `docs/18` 与 `docs/03`）

| ★ code | ★ 它其实在说 | ★ 你通常写错了什么 | ★ 核到的位置 |
|---|---|---|---|
| `VMU_INVALID_ARGUMENT` | ★ 参数**不在域内**或**缺必填** | ★ 值越界／拼错键名／把字符串传给需要数字的键 | `kernel/prompt/index.js:130`（`vmu.prompt.compactThreshold must be a percent in (0, 100]`）✓ |
| `VMU_NOT_PERMITTED` | ★ 你**没有权限/不允许**这么做（★ 不是"不存在"） | ★ 改了**不可变**的段／在框架区间占了 pack 段 | `kernel/prompt/index.js:338`（不可变段不可重注册）✓ |
| `VMU_PROMPT_VARIABLE_MISSING` | ★ 模板里引用的变量**没给值** | ★ 新变量**没登记进 `VARIABLE_WHITELIST`** 或装配时没传 | `kernel/prompt/index.js:496` ✓ |
★ **拒绝的形状**（写自己的拒绝时照它）：`refuse(code, message, hint)` ⇒ ★ 返回的 `Error` 上挂 **`err.code`** 与 **`err.hint`** ✓（`kernel/prompt/index.js` `export function refuse(code, message, hint)`）

---

## 6. ★★ 同名不同物（★ 这些是本仓最容易误读的地方）

| # | ★ 同名/近名 | ★ 区别（★ 核过） |
|---|---|---|
| **6.1** | ★ 顶层 **`vmu/`** ↔ **`vibe-math-vmu/`** | ★ 顶层 `vmu/` **只有一个 `audit/` 子目录**（★ **不是**文档、**不是**框架）；★ 框架在 `vibe-math-vmu/`；★ **vmu 文档在 `vibe-math-vmu/docs/`** ✓ |
| **6.2** | ★ `installer.js`／`cordis.patch.yml`／`preset-declaration.js` ↗ **在仓库根**；★ `vibe-math-vmu/` 里**没有**这三个文件 | ★ 在框架目录里找不到它们**不是缺陷**：★ 它们属于**安装/接线层**，在根 ✓ |
| **6.3** | ★ **两套 `docs`**：★ `docs-landed/NN-…` ↔ ★ `docs/NN-…`（＝`vibe-math-vmu/docs/`） | ★ 裸写 `01-architecture` **会走到错的地方**：★ `docs-landed/01`＝**短版**；★ `docs/02-architecture`＝**权威细节**；★ **编号不同是刻意的**（本目录编号是**阅读顺序**，不是卷号）✓（`07 §1.1`） |
| **6.4** | ★ `docs-landed/07` 说"本目录**七卷**" | ★ 那是**当时**的事实：★ **本卷（08）使之为 8** ⇒ ★ **不回去改 `07`**（★ 历史陈述值在"当时"）；★ 要数就数：`ls docs-landed/*.md \| wc -l` ✓ |
| **6.5** | ★ `vibe-math-v5*`（历史各代）↔ `vibe-math-vmu`（框架） | ★ 前者是**被替换的 preset 各代**（parity 对照面）；★ 后者是**框架本体** ⇒ ★ **不要把它们当同一个东西读** ✓ |
| **6.6** | ★ 两个 `settings` | ★ **声明**＝`vibe-math-vmu/settings/schema.js`（可设什么）；★ **本机构的取值**＝`packs/v5r/settings/defaults.json`（★ 后者是**值**，不是声明）✓ |
| **6.7** | ★ `docs/acceptance/` ↔ `docs/` 其它 .md | ★ 前者是**过程与审计记录**（★ **339** 份，★ 按需检索、**不要通读**）；★ 后者是**成文文档** ✓ |

---

## 7. ★ 未验证（★ 本卷**明确**没核到的东西 —— ★ 不得当成"没问题"）
1. ⚠️ **`VibeMath/` 的具体用途**：★ 只核到它存在且内含 `Projects/` ⇒ ★ **用途未验证**。
2. ⚠️ **术语 `track`／`slot`／`primitive`**：★ 任务单列出了它们，★ 但**本轮未在代码里核到定义位置** ⇒ ★ **未写进 §2 速查表**（★ 宁可缺，不可编）。
3. ⚠️ **§5 的错误码语义**：★ 只核了**三个**的原文与位置；★ 其余数百个**未逐个核**（★ 权威在 `docs/18`／`docs/03`）。
4. ⚠️ **§1 的"一句话用途"**：★ 都核到了**路径存在**与**关键内容**（如 `kernel/*.js` 计数、`packs/v5r` 结构）；★ 但**"用途"的措辞**是**我据代码/文件判定**的，★ 未逐文件读实现。
5. ⚠️ **`extensions/` 的具体内容**：★ 只核到目录存在 ⇒ **未核**。
6. ⚠️ **`~三处文档过期**：★ 发现 `07 §2` 的"七卷"（见 §6.4）；★ 其它卷的陈旧数字**本轮未全面复核**（★ 要查用生成器的 `--check`）。
