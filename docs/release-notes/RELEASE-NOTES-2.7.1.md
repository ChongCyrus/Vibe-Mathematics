# dsh-vibe-math 2.7.1 — 发布说明（中文）

> 上一版：2.7.0。本版是**补丁版**，两批改动一起发。**第一批（诚实性与安装口径）**：替代方案若改变精确性或结论强度必须声明；python 安装按**检测到的环境**分派 conda/mamba/uv/pip；R/Octave/Julia 的系统级作用域拒绝给出**每引擎理由**；**版本求解交给包管理器**，本工具只查存在。**第二批（首次真机端到端跑出来的七个缺陷）**：`probe` 回显请求的引擎、引擎发现新增 **DSH 自带运行时**、`cli` 逃生口的包预检改用它自己那个解释器、`mode:'code'` **真的把脚本传进去**（调用方 argv 自带程序槽时以调用方为准）、版本报真值、探针 argv 不含 shell 元字符、探测不再依赖项目目录已存在。既有参数默认值、数据格式与目录结构**未变**，DSH 支撑窗口不变，无需迁移。

---

## 概览

- **替代必须声明**：新规则行（中/英）说明"替代方案改变精确性/结论强度时必须写明"，进入四套预设的**两个 persona 文本块**、规则段与工具描述；缺引擎/缺包时明确给**替代方案或安装计划**，安装一律 `plan → planToken → confirm`。
- **python 包管理器分派**：`conda` / `mamba`（`-y -c conda-forge`）/ `uv`（`uv pip …`）/ **pip 回退**（`-m pip install --user`）；按解释器**自身环境**检测，不猜；歧义时回退 pip 并在计划/消息/审计里标明**假设**。
- **系统级作用域有理由**：`system` 仍返回 `MATH_REFUSED` + `next.reason:'system-scope-unsupported'`，但消息现在说明**每个引擎为什么**（R→`R_LIBS_USER`、Octave→`share/packages`、Julia→`JULIA_DEPOT_PATH`，conda/mamba/uv 各自理由）。
- **版本约束口径**：接受 `名称` / `名称[extras]` / `名称<op>版本`；其余写法显式拒绝（新 reason `unsupported-version-syntax`）。**版本求解是包管理器的事**，本工具只按 base name 查存在、把规格原样透传。
- 随功能修掉一个真机缺陷：安装路径此前按**引擎名**解析解释器（`python`）而不是候选顺序（`python3`→`python`→`py`），会让 conda 检测在真机上失效。

## 变更

### 1. 替代方案的诚实性

- **规则**：当替代方案改变了**精确性或结论强度**时——精确符号解 → 数值近似、闭式解 → 采样/求积、改了精度/容差/假设、换了算法类——结论里**必须写明**，不得读起来像得到了原本（精确/所要求的）结果；拿不到精确结果就直说。
- **落点**（中/英各一条常量）：`MATH_SUBSTITUTION_RULE_LINE` / `MATH_SUBSTITUTION_RULE_LINE_EN`，已并入 `MATH_RULE_LINES`/`_EN`（因此 `mathAvailabilityLine()` 自动携带），工具描述也加了同义句；**四套预设的两个 persona 文本块都逐字追加**（追加，不替换既有规则行）。
- **缺引擎/缺包**：仍然只报告，并明确给**用户自装指引**或**代理代装计划**；**安装一律先出计划、再由 `planToken` 确认**（token 绑定计划内容，内容变了即失效），默认 user 作用域，`system` 每次显式且不被记住。

### 2. Python 包管理器分派

`python` 的安装计划按**解释器自身环境**选择管理器，而不是固定 pip：

| 检测到的环境 | 计划里的命令 | 依据 |
|---|---|---|
| 解释器路径含 conda 标记（`/envs/`、`/conda`、`/miniconda*`、`/anaconda*`、`/mambaforge`、`/miniforge`）且 `conda` 可解析 | `conda install -y -c conda-forge <pkg>`（卸载 `conda remove -y <pkg>`） | 路径标记 + 可解析确认 |
| 同上但只有 `mamba` | `mamba install -y -c conda-forge <pkg>`（卸载 `mamba remove -y <pkg>`） | 同上 |
| `uv` 与解释器**同目录**（uv 管理的 venv） | `uv pip install <pkg>`（卸载 `uv pip uninstall <pkg>`） | 同目录才算 |
| 其它 | `python -m pip install --user <pkg>`（卸载 `python -m pip uninstall -y <pkg>`） | **文档化回退**，计划标 `managerAssumed` |

- **检测，不猜**：计划、返回消息与审计 JSON 都带 `manager` / `managerAssumed` / `managerWhy`；歧义时回退 pip 并明说"计划假设用 pip"。
- **install 与 uninstall 成对**：卸载命令来自同一个被选中的管理器（审计里带卸载模板；仍**没有**通用自动回滚）。
- **顺手修掉的真实缺陷**：安装路径此前用**引擎名**（`python`）解析解释器，而不是描述符的**候选顺序**（`python3`→`python`→`py`）——真机上 conda 的 `python3` 才是那个解释器，所以分派会看不到环境标记。现在与运行路径一致，按候选依次解析。

### 3. 每引擎系统级作用域策略

- R / Octave / Julia **只做用户级**，`scope:'system'` 返回 `MATH_REFUSED` + `next.reason:'system-scope-unsupported'`，消息里给出**该引擎的理由**：
  - **R**：用户库是 `R_LIBS_USER`；系统级要写发行版包目录（需 root 或发行版包管理器）。
  - **Octave**：`pkg install` 装进用户包目录；系统级要写 Octave 的 `share/packages`（需 root）。
  - **Julia**：`Pkg.add` 装进当前活动环境 / 用户 depot（`JULIA_DEPOT_PATH`）；"系统级"不是 Julia 的概念。
- **conda / mamba / uv** 同样没有系统模板，各自带理由；**python 走 pip 时仍保留真实的系统模板**（不带 `--user`），由每次调用显式确认。

### 4. 版本约束口径

- **接受的写法**：`名称`、`名称[extras]`、`名称<op>版本`，其中 `<op>` ∈ `==` `>=` `<=` `~=` `!=` `>` `<` `=`（pip 风格的 `numpy==1.2`、conda 风格的 `numpy=1.2`）。
- **拒绝的写法**：空格、`;`、`|`、`&`、`$`、反引号、`@`、括号等 shell 危险或管理器不认识的语法 ⇒ `MATH_INVALID_ARGUMENT` + `next.reason:'unsupported-version-syntax'`（**不会**把可疑字符串丢给 shell）。
- **分工**：**版本求解交给包管理器**——本工具只按 **base name** 探测与报缺，安装计划把规格**原样透传**，并在计划里带 `versionPolicy` 说明这一点。
- **词汇表**：`unsupported-version-syntax` 是新增的机读 reason；词汇表现共 **13 reason / 7 `next.kind` / 11 失败码**，在 `tool-schema.json#refusalVocabulary`、`docs/math-computation.md` §3 与 parity 守卫之间保持**集合相等**（守卫还要求每个 `reason:` 取值都是字符串字面量）。

### 5. 真机缺陷修复（一条根因、三个症状）

1. **`op:'probe'` 忽略请求的引擎**：响应里 `engine` 是 `null`（或"第一个允许的引擎"），失败路径总是指责 `params.mathEngines[0]`（python），于是 `probe{engine:'r'}` 回显 python 并让用户去装 python。现在解析并报告**请求的**引擎（名字/路径/版本）；被请求且解析成功的引擎（包括 `cli`）也算可用，请求的引擎缺失时错误与指引都指向它。
2. **引擎发现漏掉 DSH 自带的运行时**：PATH 仍然优先；都没有时，若宿主声明了可选字段 `runtimeRoots` + `listDirAbs`，最后扫描 `<root>/dsh-runtimes/*/dependencies/<engine>/`——**树名通配**（从不写死 `dsh-primary-runtime`），且只接受描述符自己的候选名。找到的引擎会报**真实版本**，并且**不再给安装指引**（对已装的引擎给 winget 提示正是误导的来源）。
3. **`cli` 包预检忽略 `cli.command`**：通用 `cli` 描述符没有包探测，于是所有包看起来都缺、逃生口把自己堵死。现在按解析出的命令的**族**（`python*`/`Rscript`/`octave`/`julia`）用**那个解释器**探测；族不可识别时**跳过**预检并给出明确警告，而不是误报"缺包"。
4. **`mode:'code'` 从不传脚本**：`cli` 只拿到命令，于是 python 掉进 REPL（`exit=0`、stdout 空——读起来像成功）。现在 `mode:'code'`/`'file'` 会把归档脚本路径追加到 argv；**若调用方 argv 自带程序槽（`-c`/`-m`/`-e`/`--eval`/`--command`）则以调用方为准、不追加**（否则脚本会被当成多余参数）。回执记录 `cli.scriptAppended`，跳过时记录 `cli.scriptSkipped` 及原因。
5. **`engine.version` 是 `"unknown"`**：`cli` 现在用族描述符的**真实版本探测**取版本（族不可识别时仍是 `"unknown"`）。
6. **探针 argv 含 shell 元字符**：真实宿主对含 `|`（以及 `%`）的 argv 会返回**空 spawn**。所有探针代码改为不含元字符（每包一行 `名称 ok|missing`），解析器同时接受旧的 `名称:状态` 与新形态；python 仍是**每包一个 argv 项**。
7. **根因：探测的 cwd 在全新工作区不存在**。版本探测、包预检与许可探测用 `projectRoot()` 作 cwd，而全新会话里该目录还不存在，宿主对这种 spawn 返回 `spawned:true, exit:null`（**重试无用**：同 cwd 同结果）。这一条同时造成了"找到了却不可用"、误报"缺包"与 `version:"unknown"`。现在探测走**一定存在**的 cwd（`probeCwd`：可选宿主字段 → OS 临时目录 → 项目根）；真正的 `run` 仍用项目根——它本来就会先写回执，写盘会创建目录树。

### 6. 新增两条永久守卫

- **§20 响应必须可 JSON 序列化**：诊断对象曾出现自引用的 `retryDiag`，导致 `JSON.stringify(response)` 抛 `Converting circular structure to JSON`，调用方**看不到任何结果**。现在诊断经 `jsonSafeDiag` 投影成纯字段，共享套件断言 **13 种响应**（`probe`/`run`/`receipt`/`install`，成功与失败，含重试后失败的 `retryDiag` 场景）都能序列化。
- **§21 fresh-root 仿真**：假 seam 模拟宿主（"cwd 不存在 ⇒ `exit:null`"，且 `writeText` 标记目录已创建），断言全新根上 `probe` 仍 `ok:true` 且版本是真值、没有任何探测报 `exit:null`、包预检照常运行。

### 7. 审查与验证

- **同一套纪律**：共享模块四份**字节一致**（`install-copies --check` ⇒ `COPIES OK`）；`math-computation-shared` **278/0**、四套预设 **114/116/153/117**、`audit-math-computation-contract` **155/0**、`audit-math-computation-parity` **92/0**、`audit-math-computation-sensitivity` **22 探针 / 0 problems**、变异证明 **16 proved / 0 problems**（每一个都把**具名**断言打红）；门禁 `TOTAL 65  PASS 65  FAIL 0`（**44 套件 + 21 探针**）。
- **真机证据（全新空工作区、第一个工具调用）**：`probe{engine:'python'}` ⇒ `ok:true`、版本 `3.12.14`、路径 `…/dsh-runtimes/dsh-primary-runtime/dependencies/python/python.exe`、无 `exit:null`；用 `cli` + 自带解释器 `run` 且 `packages:['numpy']` ⇒ `exit:0`、`stdout:"1.643935 -2.0"`（k=1..1000 的 Σ1/k² 与 det([[1,2],[3,4]])）、`packages.found.numpy:"present"`、`warnings:[]`、回执 6 个文件。
- **仍然成立的诚实边界**：引擎执行现在**已通过 `cli` 逃生口在 DSH 自带运行时上真机验证**（这是本项目唯一被证明的真实引擎路径——内置引擎仍只通过假 subprocess seam 覆盖）；`session/follow` 的 token 级增量、多客户端与回合中 `cancel` **仍未验证**；宿主 `subprocess.spawn` **没有 policy 槽**，插件不能强制禁网/限权（需宿主 sandbox）；Maple/MATLAB/Wolfram 的模板标 `VERIFY` 并提供 `mathEngineOverride`；**SageMath 属 P2**；两个对照实验只是 **run-book**，本说明**不含编造数字**。

## 兼容性

- 既有参数默认值、数据格式与目录结构**未变**；新增的只是规则文本、安装计划的分派逻辑与一个机读 reason，**无需迁移**。
- **行为变化仅限安装计划**：没有 conda/uv 标记的机器仍走 pip（与上一版一致）；**conda/mamba/uv 环境现在会得到该管理器的命令**（这正是本版目的），卸载命令同样来自该管理器。
- `system` 作用域的返回码与 `next.reason` **未变**（只是消息更有信息量）；python+pip 的系统模板仍在。

## 升级

- 直接升级即可，无需迁移。
- 若希望安装计划**总是用 pip**：在非 conda/uv 的解释器上运行（或指向系统 python）；本工具不会"猜"管理器，只在解释器自身环境给出标记时才分派。
- **七个真机缺陷全部修复**（都来自首次真机端到端，且都在同一份字节上关闭）：`probe` 对任何请求引擎都回显 `python`；DSH 自带运行时发现不到；`cli` 包预检忽略 `cli.command`；`mode:'code'` 从不传脚本；`engine.version` 是 `"unknown"`；探针 argv 含 `|`/`%`（真实宿主会以空 spawn 回应）；探测用的 cwd 在**全新工作区还不存在**——**这一条是"找到了却不可用"和"误报缺包"的共同根因**。
- **新增两条永久守卫**：§20 **13 种响应必须可 JSON 序列化**的横切不变量；§21 **fresh-root 仿真**（cwd 不存在时宿主返回 `exit:null`）。

