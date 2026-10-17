# 07 · **索引与关系：`docs-landed` 与 `docs/` 三十卷是什么关系**

> ★ **这一卷解决的唯一问题**：★ **读者该看哪一份？★ 两份冲突时信谁？**

## 1. ★★★★★ 一句话说清关系

★ **`docs/`（`vibe-math-vmu/docs/` 的 **00–29 共 30 卷、约 2 万行**）是【权威细节】。**
★ **`docs-landed/`（本目录，7 卷、约 700 行）是【上面的一层短版 ＋ 定稿时的真实状态】。**
★ **★ 冲突时以 `docs/` 为准** —— ★ **而发现冲突【本身就是缺陷】，★ 应当修其中错的那一份**（★ 而不是"以谁为准"就算了）✓
### ★★★ 1.1 【引用格式】—— 两套文档同名形状，必须带前缀
★ 两套文档**都用 `NN-名字.md` 命名** ⇒ ★ **裸写 `01-architecture` 会走到错的地方** ✓
★ **因此本目录一律用前缀区分**：
| ★ 写法 | ★ 指 |
|---|---|
| ★ `docs-landed/NN-…` | ★ **本目录**（★ 短版 ＋ 定稿状态）|
| ★ `docs/NN-…` | ★ **`vibe-math-vmu/docs/`**（★ 权威细节）|
| ★ `docs/acceptance/…` | ★ **过程与审计记录** |
★ **注意一处最容易混的**：★ **架构**在两边都有 ——
★ `docs-landed/01-architecture.md`（★ **本目录：104 行，概括**）
★ `docs/02-architecture.md`（★ **权威：305 行，细节**）
⇒ ★ **编号不同是刻意的**：★ **本目录的编号是【阅读顺序】，★ 不是【卷号】** ✓

## 2. ★★★ 本目录七卷（★ 先看哪个）

| ★ 卷 | ★ 什么时候看它 | ★ 它对应的权威细节卷 |
|---|---|---|
| ★★ **`00-README.md`** | ★ **第一次接触** —— ★ 它是什么、可信度多少 | ★ `01-philosophy`（哲学）／★ `02-architecture` |
| ★★ **`01-architecture.md`** | ★ 想懂**一次运行怎么转** | ★ `02-architecture`／★ `26-turn-orchestration`／★ `27-pack-folder` |
| ★★ **`02-running.md`** | ★ **要把装起来跑一遍** | ★ `12-user-guide`／★ `18-command-and-protocol-reference`／★ `26-turn-orchestration` |
| ★★★ **`03-extending.md`** | ★ **要造自己的机构**（★ 哲学的兑现处） | ★★ **`10-packs`**／★ **`27-pack-folder`**／★ **`29-build-your-own-preset`**／★ `05-middleware`／★ `06-prompt-pipeline` |
| ★★ **`04-verification.md`** | ★ 想知道**凭什么相信它** | ★ `11-gates-and-development`／★ `18-command-and-protocol-reference` |
| ★★★ **`05-known-debt.md`** | ★ ★ **想知道它【没做成】什么** | ★ `23-extensions-and-deferred`／★ `14-open-items-and-roadmap` |
| ★ **`06-coverage-map.md`** | ★ 想找**某个方面的落点** | ★ `02`／★ `03`／★ `04`／★ `08`／★ `09`／★ `16`／★ `17`／★ `22` |

## 3. ★★★★★ `docs/` 三十卷的全表（★ 权威细节，按主题归组）

### 3.1 总纲与哲学
| ★ 卷 | ★ 内容 |
|---|---|
| ★ `00-README.md`（334 行） | ★ 文档总览 |
| ★ `01-philosophy.md`（195） | ★ **哲学、要求与裁决记录** |
| ★ `02-architecture.md`（305） | ★ 架构总览 |
| ★ `28-decision-history.md`（1740） | ★ **裁决与审判历史**（★ 为什么变成今天这样） |

### 3.2 契约与可调控
| ★ 卷 | ★ 内容 |
|---|---|
| ★ `03-interface-contract.md`（1502） | ★ **内核接口契约（公开面登记处）** |
| ★ `04-settings.md`（1564） | ★ **设置手册**（★ **1232 键，生成**）|
| ★ `18-command-and-protocol-reference.md`（455） | ★ 工具/服务/钩子/协议/权限矩阵/错误码速查 |

### 3.3 机制
| ★ 卷 | ★ 内容 |
|---|---|
| ★ `05-middleware.md`（499） | ★ **中间件与钩子**（★ 四形态全生命周期、钩子全景、插件与协议）|
| ★ `06-prompt-pipeline.md`（371） | ★ **提示词管线**（★ **用户可接管每一段**）|
| ★ `07-durability-library.md`（691） | ★ 耐久与归档（Store & Library）|
| ★ `08-primitives-meeting-ballot-workflow.md`（1326） | ★ **会议·表决·工作流·任务板·控制流** |
| ★ `26-turn-orchestration.md`（467） | ★ **整轮编排** |
| ★ `27-pack-folder.md`（195） | ★★ **整合包文件夹**（★ **"实际运行机制＝框架＋整合包文件夹"**）|

### 3.4 领域面
| ★ 卷 | ★ 内容 |
|---|---|
| ★ `09-math-formalization.md`（763） | ★ 数学·形式化·计算 |
| ★ `15-math-computation-toolbox.md`（545） | ★ 数学计算工具箱 |
| ★ `16-research-lifecycle.md`（478） | ★ 学术研究生命周期 |
| ★ `17-agent-society-and-delegation.md`（770） | ★ **代理自组织与协作** |
| ★ `22-academic-operations.md`（1028） | ★ 学术运营（仪器/经费/知识…）|
| ★ `20-security-privacy-and-compliance.md`（250） | ★ 安全·隐私·合规·伦理 |
| ★ `21-observability-and-operations.md`（446） | ★ 可观测性与运维 |
| ★ `24-v5r-containment.md`（571） | ★ **v5r 包含**（★ **vmu 必须能完全实现 v5r**）|

### 3.5 实践与边界
| ★ 卷 | ★ 内容 |
|---|---|
| ★ `10-packs.md`（403） | ★ **整合包手册** |
| ★ `29-build-your-own-preset.md`（387） | ★★ **从零造一个自己的 preset/pack（走查：照做即可跑）** |
| ★ `12-user-guide.md`（429） | ★ 使用说明（用户向）|
| ★ `19-plugin-and-extension-development.md`（377） | ★ **插件与扩展开发**（★ 当 settings ＋ 中间件不够用时）|
| ★ `11-gates-and-development.md`（924） | ★ **开发与门禁** |
| ★ `13-migration.md`（912） | ★ 迁移与兼容 |
| ★ `14-open-items-and-roadmap.md`（667） | ★ **未决、风险与路线图** |
| ★ `23-extensions-and-deferred.md`（131） | ★ **不再作为核心的东西都记在这里** |
| ★ `25-demoted-domains.md`（33） | ★ 降级域（临床与动物实验）|

## 4. ★★★★ 两条【必须知道】的关系事实

### 4.1 ★★ 本目录【不重复细节】，★ 只给"结论 ＋ 状态 ＋ 债务"
★ 若你在 `docs-landed` 里读到一句断言式的结论，★ **细节、边界与例外都在对应 `docs/` 卷里** ✓
★ **例**：★ 本目录说"六条通话形态的钩子"，★ 而**完整钩子表在 `docs/05-middleware.md`** ✓

### 4.2 ★★★ 本目录【独有】的东西（★ `docs/` 里没有的）
1. ★★ **覆盖率账**（★ `00-README` §4：★ **L3 88／L2 15／L1 0**、★ **24 探针 862 断言**）—— ★ **这是定稿时点的【测量结果】**，★ 不是设计 ✓
2. ★★ **债务卷**（★ `05-known-debt`）—— ★ **逐条具名的未验证项与"验证它需要什么"**，★ **其完整版在 `docs/acceptance/audit-unverified-debt.md`** ✓
3. ★★ **三门齐备度**（★ `docs/acceptance/gate-readiness.md`）＋ ★ **真机证据**（★ 两次运行、53 面、`cast:true`）✓
4. ★★ **四条审计纪律**（★ 已在 `AGENTS.md` §7）＋ ★ **5 处真缺陷的解剖** ✓
★ **这些是【过程产物】**，★ `docs/` 三十卷是**【设计产物】** ⇒ ★ **两者互补，★ 不互相替代** ✓

## 5. ★★★ 建议的读法（★ 按你的身份）
| ★ 你是 | ★ 读什么 |
|---|---|
| ★ **想快速判断它行不行** | ★ `00-README` → ★ `05-known-debt` |
| ★ **要把它跑起来** | ★ `02-running` → ★ `docs/12-user-guide` |
| ★ **要造自己的机构** | ★ `03-extending` → ★ `docs/29-build-your-own-preset` → ★ `docs/10-packs` → ★ `docs/27-pack-folder` |
| ★ **要改内核** | ★ `01-architecture` → ★ `docs/02-architecture` → ★ `docs/03-interface-contract` → ★ `04-verification`（★ 你会被门禁拦）|
| ★ **要审计它** | ★ `04-verification` → ★ `05-known-debt` → ★ `docs/acceptance/`（★ 按需检索，★ **不要通读**）|

