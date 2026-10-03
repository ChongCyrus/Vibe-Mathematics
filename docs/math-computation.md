# 数学计算工具（`math_computation`）—— 契约与用法

> 四个预设（v2/v3/v4/v5）共用同一个工具。规格与冻结件**只在开发检出里**（`_oneoff/**` **不随包发布**，`files[]` 不含它；随包读者请看本文件正文的契约与穷举表）：`_oneoff/math-computation-spec-v3.md`（rev-3）、`_oneoff/mc-P1-ready/INTERFACE-FREEZE.md`、`mc-P1-ready/{engines.md,tool-schema.json,receipt.md,prompts.md,guards.md}`。
> 本文件只讲**已实现的行为**与**明确不能保证的东西**，不含性能或效果承诺。

## 1. 它是什么

`math_computation` 让成员先在**运行时探测**本机可用的计算引擎与包，再以统一接口执行计算，并把每次执行落成**可复核回执**：脚本原件、完整输出、实际 argv、解释器/引擎版本、退出码与耗时。它比"随手用宿主 shell 跑一条命令"多出来的只有三件事——**探测**、**统一接口**、**归档**。

**P1 引擎集合**：`python`、`r`、`octave`、`julia`（自由软件，全功能）+ `matlab`、`maple`、`wolfram`（商业：只探测与许可检查，**永不安装**，有证即可用）+ `cli`（通用逃生口，**默认开启**）。SageMath 属 P2，P1 不注册。

## 2. 参数（六个，名字已冻结）

| 参数 | 取值 | 默认 | 说明 |
|---|---|---|---|
| `mathComputation` | `off` \| `auto` \| `on` | `auto` | `off` 是**真 no-op**：不探测、不执行、不在提示词里出现；`auto` 探测到引擎才工作 |
| `mathMode` | `typed` \| `typed+shell` | `typed+shell` | **只是提示词策略**（见 §6）：允许在工具不可用时用宿主 shell 兜底，但结论必须标注"未经工具归档"；`typed` 不提 shell，并禁用 `engine:'cli'` |
| `mathEngines` | 引擎名数组 | `[python, r, octave, julia, matlab, maple, wolfram, cli]` | 允许的引擎**及其探测顺序**；去掉 `cli` 即关闭逃生口 |
| `mathTimeoutMs` | 正整数（≥1000） | `60000` | 单次执行上限；超时后**主动终止**进程 |
| `mathPackages` | 字符串数组 | `[]` | 默认要求存在的包/工具箱（缺包只报告，不安装） |
| `mathInstallScope` | `user` \| `system` | `user` | **作用域只对当次调用生效，永不记忆**；多数包管理器没有 system 模板，此时 system 请求会被拒绝 |

非法值一律回落默认（枚举非白名单 → 默认；`mathTimeoutMs` 非正 → 默认并抬到 ≥1000；`mathEngines` 过滤未知项、去重、空则回落默认）。

## 3. 工具接口

```
math_computation {
  op: 'probe' | 'run' | 'receipt' | 'install',
  engine?, mode?: 'code'|'file'|'expr', code?|file?|expr?,
  packages?, timeoutMs?, captureFiles?, record?,
  cli?: { command, argv?, stdin? },         // engine='cli' 必填
  scope?: 'user'|'system', dryRun?, confirm?  // op='install'
}
```

- **`probe`**：只探测引擎/版本/许可与（可选的）包，**不执行用户代码**。没有可用引擎时返回 `MATH_ENGINE_NOT_FOUND` + 逐 OS 的用户安装指引。
- **`run`**：`mode:'code'` 由工具把源码落成 `script.<ext>` 再执行；`mode:'file'` 只接受**项目内**路径（复制进回执目录后执行）；`mode:'expr'` 走该引擎的 eval 模板（表达式只占**一个** argv 元素）。`engine:'cli'` 时 argv = `cli.command` + `cli.argv`，`mode:'expr'` 被拒绝。
- **`receipt`**：对既有 `Computation/<id>/` **幂等**重渲染 `receipt.md`、补写缺失产物，**不重跑**。
- **`install`**：两步。先 `dryRun`（默认）返回计划与 `planToken`；执行必须把该 token 原样回传 `confirm`，token 不符即拒绝。**商业引擎一律拒绝**。

失败码（11 个，全部 `MATH_` 前缀）：`MATH_NOT_AVAILABLE`、`MATH_ENGINE_NOT_FOUND`、`MATH_ENGINE_LICENSE_REQUIRED`、`MATH_ENGINE_UNUSABLE`、`MATH_MISSING_PACKAGES`、`MATH_TIMEOUT`、`MATH_NONZERO_EXIT`、`MATH_ENGINE_BAD_ARGV`、`MATH_REFUSED`、`MATH_INVALID_ARGUMENT`、`MATH_NO_SUBPROCESS`。每个"环境缺失"类失败都带 `next`（自装指引 / 代装计划 / 厂商链接 / 启用建议）。

**"没有 subprocess 服务"与"没有引擎"是两件事**（避免误导用户去装 python）：
- 宿主若能声明自己没有 subprocess 服务（预设可选提供 `hasSubprocess:()=>false`），`run` 与 `probe` 一律返回 `MATH_NO_SUBPROCESS` + `next.kind:'note'`；
- 宿主不提供该声明时：命令**解析不到** ⇒ `MATH_ENGINE_NOT_FOUND`（附逐 OS 安装指引）；能解析但 `spawn` 拿不到句柄（返回 `null`）⇒ `MATH_NO_SUBPROCESS`。
- **机读词汇表（穷举；权威副本**只在开发检出**里：`_oneoff/mc-P1-ready/tool-schema.json#refusalVocabulary`（**不随包发布**），由 parity 守卫盯着，改名即红）**：
  - `code`（11 个）：`MATH_NOT_AVAILABLE` `MATH_ENGINE_NOT_FOUND` `MATH_ENGINE_LICENSE_REQUIRED` `MATH_ENGINE_UNUSABLE` `MATH_MISSING_PACKAGES` `MATH_TIMEOUT` `MATH_NONZERO_EXIT` `MATH_ENGINE_BAD_ARGV` `MATH_REFUSED` `MATH_INVALID_ARGUMENT` `MATH_NO_SUBPROCESS`；
  - `next.kind`（7 个）：`user-install`（用户自装指引）、`agent-install`（代装计划/计划就绪）、`vendor`（商业引擎厂商指引）、`enable`（`mathComputation:'off'` 的启用建议）、`engine-override`（bad-argv ⇒ 用 `mathEngineOverride` 覆盖模板）、`reason`（机读拒绝原因）、`note`（补充说明，如无 subprocess）；
  - `next.reason`（**13** 个，仅当 `next.kind==='reason'`）：`policy`、`engine-not-allowed`、`missing-cli-command`、`expr-not-supported`、`mode-not-supported`、`path-outside-project`、`file-not-found`、`system-scope-unsupported`、`plan-token-mismatch`、`archive-missing`、`receipt-unparsable`、`no-subprocess`、**`unsupported-version-syntax`**（包规格写法不被支持：版本求解交给包管理器，见 §5）。
  调用方**不必解析文案**：按 `code` + `next.kind`（必要时 `next.reason`）分支即可；新增或改名必须同时更新这里与 `tool-schema.json`，否则守卫变红（守卫还会校验每个 `reason:` 取值都是**字符串字面量**，避免以常量绕开"穷举"检查）。

## 4. 回执：可复核的支撑材料

```
<项目或研究所根>/Computation/<runId>/
  script.<ext>                 # 唯一权威源码（先落盘再执行）
  stdout.txt / stderr.txt      # 完整输出（返回体只给 ≤64KB 截断版）
  receipt.json / receipt.md    # 机器可读 + 人读
  captured/…                   # captureFiles 的项目内副本
```

- `runId = <preset>-<projectSlug>-<sha256(engine|mode|规范化的脚本|排序后的包需求)[0:12]>`——**不含墙钟**：同引擎、同脚本、同包要求在同一项目下命中同一目录。
- `receipt.json` 记录：引擎与版本、脚本路径与哈希、**实际 argv**、cwd、退出码/超时/耗时、截断标记、产物哈希、`network:"not-enforced-by-plugin"`。
- **复跑**：`math_computation { op:'run', engine:'<e>', mode:'file', file:'Computation/<id>/script.<ext>' }`，或直接照 `receipt.json` 的 `argv` + `cwd` 重放。
- 报告里"我算过"要给 `Computation/<id>/receipt.json`；**回执是经验证据，不是证明**——对象是否已验证仍由各预设既有的验证/共识路径决定。

### 4.1 归档 → 编辑 → 重跑（可发现性与完整性）

回执与返回体都带 **`scriptPath`**（归档脚本周相对路径）与 **`scriptHash`**（脚本字节的 sha256），所以"这次跑的到底是哪份代码"是可查的：

1. `mode:'code'` 把源码落成 `Computation/<id>/script.<ext>`；agent **可以用普通文件工具打开并编辑它**。
2. 要拿到"改过代码"的证据，编辑**你最初运行的那个源文件**，再用 `mode:'file'` 指向**同一个源路径**重跑：归档 id 以**源路径**为键，所以这会写出**同一归档 id 的新 attempt**（新 `scriptHash`）；重跑**归档副本本身**（`receipt.scriptAbs` 那个路径）则是**另一份新归档**（新 id、attempt 1、无历史，见 §3.5 下方说明），**不会**给出"同一归档的新 attempt"。
3. **旧回执对修改后的代码无效**。`mode:'file'` 的回执按**路径**归属 archive id（不是按内容），所以"同一文件编辑后重跑"落在同一 id 的**新 attempt**，并显式给出：
   - `scriptChanged:true`：该文件当前哈希与**上一份回执**记录的 `scriptHash` 不一致（旧回执不再代表当前代码）；
   - `scriptChangedDuringRun:true`：文件在**本次运行期间**被改动（典型是另一个成员同时在编辑）——运行前后各取一次哈希才可能发现；
   - 两者都同时进入 `warnings[]`（`SCRIPT_CHANGED_SINCE_LAST_RECEIPT` / `SCRIPT_CHANGED_DURING_RUN`）与 `receipt.md`，**绝不静默**。
4. `op:'receipt'` 会重新核对归档脚本的当前哈希与回执记录，返回 `scriptChanged` / `currentScriptHash`；它**只读**返回既有数据，仅补写**缺失**的 `receipt.md`，从不改写已有回执文件。**归档目录不存在**时返回 `MATH_REFUSED` + `next:{kind:'reason', reason:'archive-missing'}`（显式拒绝，不是"参数错误"）；`receipt.json` 存在但**无法解析**时仍是 `MATH_INVALID_ARGUMENT`（`reason:'receipt-unparsable'`，那确实是坏掉的产物）。
   - **哈希的能力边界（按设计，不是缺陷）**：`scriptHash`/`scriptChanged` 是**内容**哈希——"内容相同但换了 inode/mtime（删了重建、复制覆盖）"与"改了又改回原样"**无法区分**，因此也不会被告警；需要区分"文件被动过"请用宿主的版本守卫（`ctx.fs` 的 `expected.version`）。**每会话模块实例的生命周期**跟随该会话对象（v4 原有生命周期，非本轮引入）。
   - **手改状态文件里的未知键不会被静默丢弃（round-4）**：v5 从研究所状态文件恢复参数时，白名单之外的键会被忽略，但**会记入 `vibe_v5_status` 的 `diagnostics`**（`{kind:'state-dropped-keys', where, keys}`）并打印警告；同一归一化器也服务 `vibe_v5_set` / `vibe_v5_configure`，所以未知键在任何入口都不会无声消失。
5. **归档是追加式的**：同一 id 的**首次**运行落在 `Computation/<id>/`，之后每次运行落在 `Computation/<id>/attempts/<n>/`（n 从 2 开始，取第一个空位）；已有文件**永不覆盖**。**并发**下同一 id 的两个运行由模块按 id 串行分配，因此一定分别拿到 attempt 1 / attempt 2，不会共用目录（跨进程并发见 §6 的限制说明）。
6. **失败关闭（fail-closed）**：源文件在运行**期间消失** ⇒ `scriptChangedDuringRun:true`；`op:'receipt'` 读不到归档脚本（被删/移走）⇒ `scriptChanged:true` + `currentScriptHash:null`。任何"读不到/对不上"都按"旧回执不可用"处理，绝不静默当真。
7. **保留上限**：每个 id 最多 `MATH_ARCHIVE_MAX_ATTEMPTS_PER_RUN`=20 个 attempt、每个项目最多 `MATH_ARCHIVE_MAX_RUNS`=200 个 run 目录（后者仅在宿主提供可选 `listDir` 时检查）。**超过只告警**（`ARCHIVE_RETENTION_EXCEEDED`），**永不自动删除**。

**验证者（或复核代理）要查的六件事**：① 打开 `receipt.json` 确认 `scriptPath`；② 重新计算该脚本 sha256，与 `scriptHash` **逐字相等**；③ 确认 `scriptChanged` 与 `scriptChangedDuringRun` 均为 `false`（否则该回执不足以支撑结论）；④ 确认 `sourceFile`（若有）正是被验证的源码，且 `attempt`/`attemptDir` 是当前代码对应的最新 attempt；⑤ 按 `argv` + `cwd` 重放，结果一致；⑥ 一旦改代码，**必须重跑并引用新回执**，报告里的旧回执撤下。

## 5. 安装：两条路径

1. **用户自己装**：工具在缺引擎时返回逐 OS 命令（Windows/macOS/Linux）与官方链接；商业引擎只给厂商安装包与激活说明。
2. **代理代装**：`plan → confirm`（token 绑定该计划，内容变了就失效）；默认 **user 作用域**（`pip --user`、用户 depot、`R_LIBS_USER`、Octave 用户包目录…）；**system 作用域必须每次显式指定且不被记住**；每次执行写审计 `Computation/installs/<planToken>.json`（计划、作用域、管理器、命令、退出码、before/after、卸载命令模板）。

**诚实的回滚说明**：包安装**没有通用回滚**。工具保证的是——记下确切命令与 before/after 版本（卸载**可验证**）、默认 user 作用域限制影响面、提供各管理器的卸载模板；**不做**自动回滚。

### 5.1 Python 的管理器分派（检测，不猜）

`python` 的安装计划按**解释器自身环境**选择包管理器，而不是固定 pip：

| 检测到的环境 | 计划里的命令 | 依据 / 说明 |
|---|---|---|
| conda 环境（解释器路径含 `/envs/`、`/conda`、`/miniconda*`、`/anaconda*`、`/mambaforge`、`/miniforge`）且 `conda` 可解析 | `conda install -y -c conda-forge <pkg>`（卸载 `conda remove -y <pkg>`） | 路径标记 + 可解析确认 |
| 同上但只有 `mamba` | `mamba install -y -c conda-forge <pkg>`（卸载 `mamba remove -y <pkg>`） | 同上 |
| `uv` 与解释器**同目录**（uv 管理的 venv） | `uv pip install <pkg>`（卸载 `uv pip uninstall <pkg>`） | 同目录才算，PATH 上别处的 uv 不算 |
| 其它 | `python -m pip install --user <pkg>`（卸载 `python -m pip uninstall -y <pkg>`） | **文档化回退**，且计划里标 `managerAssumed:true` |

计划、返回消息与审计 JSON 都带 `manager` / `managerAssumed` / `managerWhy`——**歧义时回退 pip 并明说"计划假设用 pip"**，绝不猜。

### 5.2 R / Octave / Julia：只做用户级（并说明为什么）

这三个引擎**没有系统级模板**，`scope:'system'` 一律返回 `MATH_REFUSED` + `next.reason='system-scope-unsupported'`，消息里带**每引擎的理由**：

- **R**：用户库是 `R_LIBS_USER`；系统级要写发行版包目录（需 root 或发行版包管理器）。
- **Octave**：`pkg install` 装进用户包目录；系统级要写 Octave 的 `share/packages`（需 root）。
- **Julia**：`Pkg.add` 装进当前活动环境 / 用户 depot（`JULIA_DEPOT_PATH`）；"系统级"不是 Julia 的概念。

python 走 pip 时仍有真实的系统模板（不带 `--user`）；conda/mamba/uv **没有**系统模板，各自带理由。

### 5.3 版本约束：交给包管理器，工具只查存在

- **策略**：**版本求解由包管理器负责**，本工具**只检查包是否存在**（按 **base name** 探测与报缺），安装时把规格**原样透传**。计划里带 `versionPolicy` 说明。
- **接受的写法**：`名称`、`名称[extras]`、`名称<op>版本`，其中 `<op>` ∈ `==` `>=` `<=` `~=` `!=` `>` `<` `=`（例如 pip 的 `numpy==1.2`、conda 的 `numpy=1.2`）。
- **拒绝的写法**：空格、`;`、`|`、`&`、`$`、反引号、`@`、括号等 shell 危险或管理器不认识的语法 ⇒ `MATH_INVALID_ARGUMENT` + `next.reason='unsupported-version-syntax'`（**不会**把可疑字符串丢给 shell）。

- **冻结参与集（freeze/prune）规则（v4，round-9 P2/D4 的设计决定）**：验证/会议开始时把当时的名册**快照**下来（`rosterSnapshot`）并记录 `rosterVersion`，所有视图（`status()` 的 `consensus`/`meeting`/`verify`、以及内部的 `allSpoke`/`allVoted` 判据）**一律读快照**，不再从活的 `residents` 重新推导。三条配套语义：① **移除成员时同时从冻结集里剔除它**（`removeMember`），否则在飞投票永远凑不齐、验证/会议会卡死——v4 既有契约是"移除即释放等待"（`e2e-v4-fixes` T26/T31 钉住这一点）；② **新增成员不进入已冻结的集合**（冻结的意义）；③ **成员集真的变化时 `rosterVersion` 递增**，让任何视图都能看出自己读到的是否已过期。**约定**：没有进行中的验证/会议时，`status().frozenParticipants` 为**显式 `null`**（不是空数组、也不是旧的活名册），`rosterVersion` 仍然给出当前值。
  - **读法（推荐）**：`status().frozen` 是**原子**三元组 `{version, participants, kind}`——`participants` 是快照本身，`version` 是**冻结时记录、并在每次名册变动时重新盖章**的版本（绝不是"活计数器配旧集合"），`kind` ∈ `'verify'`/`'meeting'`（`vibe-math-v4.js:3609`；六条守卫见 `tests/formal-verify-v4.test.mjs:1582-1596`，其中包含"`frozen.version` 必须等于快照记录的版本"与"hire/fire 后活计数器严格递增"）。**`frozenParticipants` 已标注 deprecated**（`:3610`）：它是 `frozen.participants` 的别名，只为兼容旧读取者保留；新代码请读 `frozen`，不要把别名与 `status().rosterVersion`（活计数器）混用。
- **N1：编辑脚本后的"变更检测"到底对什么生效**。归档 id **以源路径为键**（`mode:'file'` 用 `file:<项目内相对路径>`，`mode:'code'/'expr'` 用脚本文本）：
  - 编辑**同一个源文件**再跑 ⇒ **同一个归档 id**、`attempt ≥ 2`（落在 `Computation/<id>/attempts/<n>/`）、`scriptChanged:true`、`previousReceipt{runId,attempt,scriptHash}` 指向上一 attempt，且**上一 attempt 的脚本与回执绝不改写**。这是 P2a 承诺的核对流程，已在真机与共享套件里双向验证。
  - 指向**另一个源路径**（例如上一 attempt 的**副本**、或新写的文件）⇒ 按设计就是**新归档**：新 id、`attempt:1`、`scriptChanged:false`、`previousReceipt:null`，且 `sourceHashBefore == sourceHashAfter`（文件在跑之前就已经是编辑后的内容）。**这不是变更检测失效**，而是"该 id 从来没有历史回执"。
  - 运行响应现在**显式带 `runId` 与 `attempt`**（此前只有 `receipt.runId`，调用方根本无法核对"是不是同一个归档"）。
  - `mode:'file'` 指向 **`Computation/…` 的归档脚本副本**是**允许**的：`projectRel()` 只做词法归一（拒绝绝对路径与越出项目根的 `..`，**不限制目录名**），所以该路径会被正常读取并执行。但按设计那是**另一份新归档**：新 id、attempt 1、无 `previousReceipt`、`scriptChanged:false`，旧 attempt 不会被覆盖。响应会用 **`fileIsArchivedScript:true`** 与警告码 **`ARCHIVED_SCRIPT_RERUN`** 说明"这不是同一归档的新 attempt"，避免把"新归档无历史"误读成"变更检测失效"。
  - **关于 nonce**：归档 id **不含任何随机数**，给定 (engine, mode, 键, packages) 完全确定；若你在某个路径里看到 nonce 样的后缀，那是**调用方自己的工作目录命名**，不是模块产生的。
- **N4：`project` 字段与 receipt 路径里的项目名是两个东西**。`project` 是**配置层的项目标识**（未配置项目时由工作区路径派生，所以会出现 `C-Users-…-vmself6` 这种 slug，它是**显示/配置值**）；而 receipt/归档路径一律用 `Projects/<当前项目名>`（默认 `default`）。两者不一致是**层次不同**，不是命名错误；改名会破坏既有状态与归档路径，故只在此说明。
- **冻结视图的版本语义（v4 P2）**：冻结视图（`status().consensus`、`report().verify`）报的是**快照当时的 `rosterVersion`**，而 `status().rosterVersion` 是**当前活计数器**；成员集变化后两者**应当不同**——这个差值正是"你读到的是过期参与集"的信号。断言方式：两个冻结视图彼此相等，活计数器 ≥ 快照版本（`tests/formal-verify-v4.test.mjs` 的 D4 跨视图用例）。
- **跨引擎位级一致（真机）**：python 与 R 的计算结果在 **16 位有效数字**上一致；第 17 位是 `digits=22` 打印出的 **double 精度噪声**，不是错误答案。别把它当成缺陷。
### 4.3 已知差异（不打算改，记录以便不再重复提问）

- **`projects:[]` 与 `project:"default"` + `frameworkRoot` 并存**：它们描述的是**两个不同层次**——`project` 是**当前工作项目名**（默认 `default`），`frameworkRoot` 是该预设的**框架根目录**（语料/状态/论文都相对它解析），而 `projects` 是**可切换的项目清单**（尚未配置过项目时为空数组是诚实的）。**结论：不改行为**，只在此说明字段含义（改名会破坏既有状态文件与文档）。
- **`cli` 逃生口的归档脚本扩展名是 `.txt`，原生引擎是各自扩展名（`.py`/`.R`/`.jl`…）**：这是**有意为之**——`cli` 的 `cli.command` 可能是任何解释器/工具，我们**不知道**它期待什么扩展名，用一个中性扩展名 `.txt` 反而更诚实（不会暗示"这一定是 python"）。内容与 `scriptHash` 与原生路径完全一致（同一 runId 计算）。**结论：不改行为**，在此说明。
### 5.4 引擎发现顺序、`op:'probe'` 的语义与 `mathEngineOverride` 的边界

- **发现顺序（PATH 永远优先）**：① PATH 上的描述符候选名（`python3`→`python`→`py`、`Rscript`→`R`、`octave`→`octave-cli`、`julia`）；② 以上都失败、且宿主声明了可选字段 `runtimeRoots` + `listDirAbs` 时，**最后**扫描 **DSH 自带运行时** `<root>/dsh-runtimes/*/dependencies/<engine>/<候选名>{,.exe,.cmd}`——**树名通配**（不写死 `dsh-primary-runtime`），且只接受描述符自己的候选名（不会塞进无关二进制）。`<root>` 由宿主给出（当前四套预设：**若 `DSH_HOME` 已设置则以它为唯一根**，否则用用户主目录下的 `.dsh`——显式设置即隔离发现，测试与定制部署都靠这个）。
- **找到可用引擎就报它的真实版本**（`engineInfo.path` + `version`），**不再**给安装指引；**只有**一个可用引擎都找不到时，才按 OS 给安装指引——而且是对**请求的那个引擎**（不是"第一个允许的引擎"）。`op:'probe'` 的 `engine`/`engineInfo` 就是**请求的**引擎；请求的引擎缺失时，`code`/`message`/`next` 全部指向它（历史上这里会回显 `python`）。
- **`mathEngineOverride` **不是**发现手段**：它只按引擎名覆盖 **argv 模板**（如 `{python:{versionArgv,scriptArgv,evalArgv,packageProbe}}`），**不能指定一个可执行文件**。所以 `MATH_ENGINE_NOT_FOUND` 的正解是：装上引擎、把解释器放进 PATH、让上面的 DSH 运行时被扫到，或用 `engine:'cli'` + `cli.command` 显式给命令。
- **round-9 响应字段（真机发现后新增，文档与实现同步）**：
  - 引擎发现顺序：PATH → 宿主自带的运行时（`runtimeRoots` + `listDirAbs`）→ **各操作系统的已知安装目录**（`mathInstallRoots(engine, env, win)`，覆盖 R / Octave / Julia / MATLAB 与 Windows 上的 Python；Maple / Wolfram 布局不固定，未纳入）。**存在性一律靠列目录证明**。宿主若提供可选的 **`installRoots(engine)`**，则**以它为准**（不再读模块进程的 `ProgramFiles`/`LOCALAPPDATA`），测试与自定义布局因此都不依赖机器环境。
- **`source` 与 `foundVia`**：回执与 `engineInfo` 的 `source` 是**粗粒度**标签（`cli`=显式命令；其余一律 `path`）；**发现来源**看新增的 **`foundVia`**（`path`=PATH/宿主解析、`host-runtime`=DSH 自带运行时、`known-install`=各 OS 已知安装目录；显式命令时为 `cli`）。
  - `probe` 返回 `configured`（配置里启用的引擎全集）与 **`absent[]`**（每个缺席引擎带 **`why`**：`not-found-on-this-machine` / `needs-a-caller-supplied-command`），message 也会点名"已配置但本机未发现：…"——可用性行**不再静默地只报一部分**（F3）。
  - `run` 的成功响应与 `MATH_MISSING_PACKAGES` 失败**都**带 **`versionPolicy`** 与 **`constraintsNotEnforced:[…]`**：明确"版本约束只按 base name 查存在、从不校验"，并点名本次**未校验**的约束（无约束时为空数组）——杜绝"静默丢弃约束"（F7）。
  - **`MATH_TIMEOUT` 与 `MATH_NONZERO_EXIT` 的证据字段一致**：都带 `argv`、`receipt`、`exit`（超时为 `null`）与 `stderr`（同样的截断上限），超时另有 `timedOut:true`（F5）。**超时的部分输出还进持久回执**：`receipt.json` 带 **`partialStdout`**/**`partialStderr`**（各取**最后 2000 字符**，`math-computation.js:1089-1090`；响应里的 `stdout`/`stderr` 走同一来源，`:1131-1132`），所以事后只看回执也能看到超时前产生了什么。
- **商业模板的"需人工确认"来源会到用户手里（item 2 实测）**：描述符里的 `verify` / `verifyReason`（例如 maple 的"CLI 拼写随版本变化，需在持证机器上确认"）现在会出现在 **`probe` 的每引擎条目与 `engineInfo`**，以及**厂商指引 `next`**（`vendor` 载荷、以及引擎未找到时的安装指引）里；字段**只在描述符声明了 `verify` 时**出现，未声明的引擎**不打印空槽**。共享套件 §30 断言"理由到达响应"与"无声明则无空槽"，`_oneoff/auditR2/verify-provenance-proof.mjs` 以同一谓词证明单点去除理由会变红。
- **`engine:'cli'` 的三条行为**：① **包预检按 `cli.command` 的族**执行（`python*`/`Rscript`/`octave`/`julia` 用对应描述符的探测）；命令族**不可识别** ⇒ **跳过**预检并给出 `PACKAGE_PRECHECK_SKIPPED` 警告（**不误报缺包、不阻塞**逃生口）。② `mode:'code'`/`'file'` 时归档脚本的**绝对路径会自动追加到 argv 末尾**（回执里 `cli.scriptAppended: true`；`cli.argv` 仍是调用方给的 argv）——否则会掉进 REPL、`exit=0` 而 stdout 为空，读起来像成功。**但若调用方 argv 自带程序槽（`-c`/`-m`/`-e`/`--eval`/`--command`），则调用方 argv 优先、不追加**（否则脚本会被当作多余参数，例如 `python -c 'print(1)' script.txt` 会把脚本喂给 `sys.argv[1]`）；此时回执给 `cli.scriptAppended:false` + `cli.scriptSkipped` 说明原因。③ `engineInfo.version` 取自**真实的版本探测**（族可识别时），不再是 `"unknown"`。
- **真实宿主上的"空 spawn"与失败可见性（round-7 实测）**：真实会话里宿主的 `subprocess` 通路**在会话早期可能对一次 spawn 返回空**（`exit=null`）。因此：版本探测**最多尝试 3 次**（20s / 45s / 45s + 退避），且只在**看起来像冷启动/空返回**（`timedOut`、`exit===null`、`spawned=false`）时重试——确定性失败（非零退出、输出无法解析）**不重试**。仍然失败时返回 `MATH_ENGINE_UNUSABLE` 并携带**机读诊断** `probe: {argv, exit, timedOut, ms, spawned, stderrTail, attempts, retried, retryDiag}`；**引擎已找到就绝不再给"去装引擎"的指引**（那会误导），改为 `next.kind:'note'`。包预检同样重试；若预检**始终跑不起来**，**不判缺包、不阻塞**，给出 `PACKAGE_PRECHECK_UNKNOWN` 警告（附 attempts/argv）——"探测失败"永远不会被读成"包没装"。
- **包存在性探测的 argv 形态**：python 的探针代码遍历 `sys.argv[1:]`，所以包名按**每个一个 argv 项**传入（`<pkgs...>`）；R/Julia/Octave 的模板把逗号串插进代码（`<pkgs>`/`__PKGS__`）。真机上曾经把 `numpy,pandas` 当成**一个**包名，导致"已装的包也报缺"。
- **探针 argv 里不得出现 shell 元字符（round-7 实测）**：真实宿主的 subprocess 通路会**拒绝**含 `|`（以及 `%`）的 argv——表现为一次**空 spawn**（`exit=null`），而不是报错。因此所有探测/许可证代码都改成**不含 `|`/`%`** 的形式（每包一行 `名称 ok|missing`），解析器两种形态都接受（`名称:状态` 与 `名称 状态`）。**新增/修改任何探针模板时都要保持这条**。
- **argv 模板的占位符替换是"字符串级"的（审查实测）**：`<script>`/`<expr>` 会在**任意位置**被替换（`String(a).split('<script>').join(abs)`），因此像 matlab 的 `run('<script>')` 这种**内嵌**写法也能正确展开；此前用的是**整元素相等**判断，matlab 实际收到的是**字面量** `run('<script>')`，脚本从未执行且不报错。共享套件现在遍历**整张描述符表**断言"任何 spawn 都不得带未替换的占位符"，parity 守卫断言"描述符不得使用未知占位符、且每个用到的占位符都有实现"。
- **残余不确定性（如实记录）**：r 与 wolfram 的 **run argv** 尚未在夹具中被逐字观测（这两个引擎的 run 在该夹具下被拒绝），它们的 argv 依赖**同一段**字符串级替换代码；若要逐字证据，需在装有该引擎的机器上各跑一次 `mode:'code'`（或扩展夹具让其 run 通过）。
- **响应必须永远可 JSON 序列化（round-7 回归）**：诊断对象曾被写成自引用（`retryDiag` 指向父对象），导致 `JSON.stringify(response)` 抛 `Converting circular structure to JSON`，调用方**看不到任何结果**。现在诊断经 `jsonSafeDiag()` 投影为纯字段（`argv/exit/timedOut/ms/spawned/stderrTail/attempts/retried/retryDiag`），共享套件有一条**横切不变量**：`probe`/`run`/`receipt`/`install` 的 13 种响应（成功与失败）都必须能 `JSON.stringify`。**新增任何响应字段都要过这条。**
- **探测的 cwd 必须"一定存在"（round-7 真实根因）**：版本探测/包预检/许可探测曾用 `projectRoot()` 作 cwd；**全新会话里该目录还不存在**，而宿主对"cwd 不存在"的 spawn 返回 `spawned:true` + `exit:null`（**重试无用**——同 cwd 同结果），于是新会话第一次 `probe` 会得到"引擎存在但不可用"。现在这三类探测统一走 `probeCwd(H)`：优先宿主可选字段 `probeCwd`，否则 **OS 临时目录**（`TEMP`/`TMPDIR`/`TMP`），最后才回退到项目根；**真正的 `run` 仍用项目根**（run 会先写回执，写盘本身会创建目录树，所以它一直是好的）。

## 6. 插件**能**与**不能**强制的东西

**能强制**：入参 schema（闭合；未知键拒绝）、**词法级**项目内路径守卫（见下）、cwd、超时并终止进程、输出上限、回执落盘、插件自身的写域（只写 `Computation/`）、安装两步与作用域默认、同一 archive id 的**串行分配**（并发运行不会共用 attempt 目录）。

**不能强制**（如实声明，勿当成承诺）：
- **路径守卫是字符串级的**：`projectRel` 只做词法规范化（拒绝绝对路径、盘符、`..` 越界），**不做 realpath、不解析符号链接/junction/硬链接**。项目内一个指向外部的链接可以绕过该守卫拿到 `mode:'file'` 的读取与执行；真正的容器化由宿主 `ctx.fs` 后端负责（`resolve`/`contains`），插件不重复实现。审计 A 的用例把这一**限制**钉成了断言（`tests/math-computation-shared.test.mjs` §16c）。
- 脚本内部的网络访问与文件访问——宿主 `subprocess.spawn` **没有 policy 槽**（`env` 层只做凭据/`DSH_*` 清洗与显式合并，不能限制网络或写盘；参见 `dsh-subprocess-local` 的 `runner-launch-*.js` 与 `vibe-math-v5.js` 中 audit M8 注释），任何被执行的计算进程都在宿主 fs 策略之外；
- `mathMode` 只是提示词策略：**模型仍可能直接调用宿主 shell**，插件无法阻止，也无法为 shell 路径生成回执。因此默认策略要求：走 shell 得出的结论必须标注"**未经工具归档（shell 路径）**"，**只有工具路径的计算才算可复核支撑材料**；
- **替代必须声明（提示词规则，同样不是强制）**：当替代方案改变了**精确性或结论强度**（精确符号解 → 数值近似、闭式解 → 采样/求积、改了精度/容差/假设、换了算法类），结论里**必须写明**，不得读起来像得到了原本（精确/所要求的）结果；拿不到精确结果就直说。规则行由 `MATH_SUBSTITUTION_RULE_LINE`/`_EN` 提供（已并入 `MATH_RULE_LINES`/`_EN` 与四套 persona 两个文本块），但**能否照做取决于模型**——插件只能要求，不能验证。
- 商业引擎的 CLI 模板随版本变化（Maple 尤甚）：描述符带 `VERIFY` 标记，**每次运行都回显实际 argv**；若引擎以用法/选项错退出，返回 `MATH_ENGINE_BAD_ARGV` + `next.kind='engine-override'`（指向 `mathEngineOverride` 覆盖模板），而不是裸 `MATH_NONZERO_EXIT`。有许可的机器应验证这三个模板。
- 真强制（禁网/限权）需要宿主 sandbox/policy 支持——**列为待上游需求**，不在本轮范围。

**验证边界（诚实声明，2026-10-01 更新）**：
- **已在真机上验证过的**（本机，真实引擎、真实子进程、真实回执）：**python 3.12.10**（用户级安装，镜像二进制 SHA256 校验通过；numpy/pandas/sympy/scipy/matplotlib/mpmath 经 TUNA PyPI 安装）与 **R 4.6.1**（CRAN 镜像；⚠️ 机器级安装、**不在 PATH**、该镜像未发布校验和 ⇒ 记为**未验证校验和**）。
  - 四个预设都能挂载并暴露同一个 15 参数 `math_computation`；四个预设在同一真实引擎上给出**相同数字**（`det=-2`、`sum=1.6439345666815597`、`integrate(x²,0,1)=1/3`、`simplify(sqrt(8))=2*sqrt(2)`；R 侧 `[1] -2`、`[1] 2/3`）。
  - **native 与 `cli` 逃生口产出完全相同的数字与相同的 `scriptHash`**（仅元数据不同）。
  - 边界码在真机上确认：语法错误 ⇒ `MATH_NONZERO_EXIT`（带 stderr + 回执，**不是** `MATH_INVALID_ARGUMENT`）；超时 ⇒ `MATH_TIMEOUT`（进程被终止）；R 警告 ⇒ `exit=0` + stderr + 回执；缺包 ⇒ `MATH_MISSING_PACKAGES` 且**不产生回执目录**；`numpy>=1` 只按存在性接受；独立 shell 重跑与回执里的 stdout **逐字一致**。
- **仍未验证的**：**Octave / Julia 未安装**（本机没有 `winget`，scoop 的依赖拉取被 `raw.githubusercontent` 阻断）；**MATLAB / Maple / Wolfram 的商业模板**仍标 `VERIFY`（需许可机器确认，`mathEngineOverride` 可覆盖模板）；**插件无法强制禁网/限权**（宿主 `subprocess.spawn` 没有 policy 槽，需宿主 sandbox）。
- 引擎发现顺序与"装了却不在 PATH"的处理见 §5.4；假 subprocess seam（`tests/helpers/math-computation-fake-seam.mjs`）仍是**回归**主力，但已**不再**是唯一的执行证据。

**并发下的完整性**：同一 archive id 的分配与"占用"（receipt.json 落盘）在**一个插件实例内**是串行的，因此两个并发同 id 运行会分别拿到 attempt 1 / attempt 2，绝不会共用目录。**跨进程**并发仍依赖宿主的独占创建原语（当前 fs 接口没有暴露，列为已知限制）。

**父目录由宿主创建（round-3 记录，勿再当缺陷）**：宿主的文本写会**自动创建缺失的父目录**——`dsh-fs-local/lib/index.js` 的 `writeFileAtomic` 在落盘前执行 `mkdir(dirname(absolutePath), { recursive: true })`。因此 `Computation/<runId>/`、`Computation/<runId>/attempts/<n>/` 以及异步作业镜像 `Formal/Jobs/` **不需要预先存在**；`ensureDirs()` 仍然列出它们只是为了空项目里的可发现性（v2/v3/v4/v5 现已都含 `Formal/Jobs` 与 `Computation`）。真机上"严格 fs 拒绝创建父目录"的实验与真实宿主行为矛盾，不能作为失败证据。

## 7. `cli` 逃生口为什么默认开启

模型本来就有宿主 shell 可用（默认 `mathMode='typed+shell'` 就允许把它当兜底），所以 `cli` **不扩大爆炸半径**；区别在于 `cli` 仍在工具内：照样有 cwd、超时、输出上限、路径守卫与回执（`engine` 记为 `cli:<command>`）。要收紧：把 `mathMode` 设为 `typed`，或从 `mathEngines` 去掉 `'cli'`——两种情况下 `engine:'cli'` 都返回 `MATH_REFUSED`。

## 8. 与形式化验证（Lean）的关系

`math_computation` 产出**经验证据**（回执可复核）；形式化证明仍是**可选**的 Lean 路径（`formalVerify: off|encourage|require`，默认 `off`）。计算回执**不能**顶替 Lean 的 `passed`/`blocked`，也不能把对象标为"已验证"。

## 9. 参数配置在哪改

`vibe_math_set_params`（v2/v3）、`vibe_v4_set`（v4）、`vibe_v5_set`（v5）以及各自的控制面：v2/v3 是 `vibe_math_setup`（交互式 schema）/`vibe_math_status`/`vibe_math_template`/`vibe_math_save_settings`，v4 是 `vibe_v4_configure`/`vibe_v4_status`（**没有** `template`/`setup`），v5 是 `vibe_v5_configure`/`vibe_v5_status`（同样没有 `template`/`setup`）；六个参数名在四套、README 双语参数表与本文中拼写一致（由 `tests/audit-math-computation-parity.mjs` 与 `audit-math-computation-contract.mjs` 盯着）。

- **安装失败的判别（不新增失败码）**：`install` 失败用 **`op:'install'` + `installedSoFar`（已成功的命令 argv）+ `timedOut`** 区分，**不**新增失败码（`MATH_FAILURE_CODES` 属冻结接口，扩展需单独的接口变更批次）；成功路径同样给出 `installedSoFar`，调用方无需特判。
