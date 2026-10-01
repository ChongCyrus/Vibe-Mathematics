# dsh-vibe-math 2.8.0 — 发布说明（中文）

> 上一版：2.7.0。本版是"安装与替代"的**诚实性收口**：替代方案若改变精确性或结论强度必须声明；python 安装按**检测到的环境**分派 conda/mamba/uv/pip；R/Octave/Julia 的系统级作用域拒绝给出**每引擎理由**；**版本求解交给包管理器**，本工具只查存在。既有参数默认值、数据格式与目录结构**未变**，DSH 支撑窗口不变，无需迁移。

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

### 5. 审查与验证

- **同一套纪律**：共享模块四份**字节一致**（`install-copies --check` ⇒ `COPIES OK`）；`audit-math-computation-contract` **151/0**、`audit-math-computation-parity` **92/0**、`math-computation-shared` **200/0**、四套预设 **113/115/152/116**、`formal-verify-v2` **471/0**、`-v3` **383/0**、`audit-math-computation-sensitivity` **22 探针 / 0 problems**、本轮变异 **5 proved / 0 problems**；门禁 `TOTAL 65  PASS 65  FAIL 0`（**44 套件 + 21 探针**）。
- **仍然成立的诚实边界**：引擎执行**只通过假 subprocess seam 验证**（本机未跑真实引擎）；宿主 `subprocess.spawn` **没有 policy 槽**，插件不能强制禁网/限权（需宿主 sandbox）；Maple/MATLAB/Wolfram 的模板标 `VERIFY` 并提供 `mathEngineOverride`；**SageMath 属 P2**；两个对照实验只是 **run-book**，本说明**不含编造数字**。

## 兼容性

- 既有参数默认值、数据格式与目录结构**未变**；新增的只是规则文本、安装计划的分派逻辑与一个机读 reason，**无需迁移**。
- **行为变化仅限安装计划**：没有 conda/uv 标记的机器仍走 pip（与上一版一致）；**conda/mamba/uv 环境现在会得到该管理器的命令**（这正是本版目的），卸载命令同样来自该管理器。
- `system` 作用域的返回码与 `next.reason` **未变**（只是消息更有信息量）；python+pip 的系统模板仍在。

## 升级

- 直接升级即可，无需迁移。
- 若希望安装计划**总是用 pip**：在非 conda/uv 的解释器上运行（或指向系统 python）；本工具不会"猜"管理器，只在解释器自身环境给出标记时才分派。
