# 数学计算工具（`math_computation`）—— 契约与用法

> 四个预设（v2/v3/v4/v5）共用同一个工具。规格与冻结件在开发检出里：`_oneoff/math-computation-spec-v3.md`（rev-3）、`_oneoff/mc-P1-ready/INTERFACE-FREEZE.md`、`mc-P1-ready/{engines.md,tool-schema.json,receipt.md,prompts.md,guards.md}`。
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
- **机读词汇表（穷举；权威副本在 `_oneoff/mc-P1-ready/tool-schema.json#refusalVocabulary`，由 parity 守卫盯着，改名即红）**：
  - `code`（11 个）：`MATH_NOT_AVAILABLE` `MATH_ENGINE_NOT_FOUND` `MATH_ENGINE_LICENSE_REQUIRED` `MATH_ENGINE_UNUSABLE` `MATH_MISSING_PACKAGES` `MATH_TIMEOUT` `MATH_NONZERO_EXIT` `MATH_ENGINE_BAD_ARGV` `MATH_REFUSED` `MATH_INVALID_ARGUMENT` `MATH_NO_SUBPROCESS`；
  - `next.kind`（7 个）：`user-install`（用户自装指引）、`agent-install`（代装计划/计划就绪）、`vendor`（商业引擎厂商指引）、`enable`（`mathComputation:'off'` 的启用建议）、`engine-override`（bad-argv ⇒ 用 `mathEngineOverride` 覆盖模板）、`reason`（机读拒绝原因）、`note`（补充说明，如无 subprocess）；
  - `next.reason`（12 个，仅当 `next.kind==='reason'`）：`policy`、`engine-not-allowed`、`missing-cli-command`、`expr-not-supported`、`mode-not-supported`、`path-outside-project`、`file-not-found`、`system-scope-unsupported`、`plan-token-mismatch`、`archive-missing`、`receipt-unparsable`、`no-subprocess`。
  调用方**不必解析文案**：按 `code` + `next.kind`（必要时 `next.reason`）分支即可；新增或改名必须同时更新这里与 `tool-schema.json`，否则守卫变红。

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
2. 编辑后用 `mode:'file'` 指向该脚本重跑，会写出**一份新回执**（新 attempt、新 `scriptHash`）。
3. **旧回执对修改后的代码无效**。`mode:'file'` 的回执按**路径**归属同一个 archive id（不是按内容），所以"同一文件编辑后重跑"落在同一 id 的**新 attempt**，并显式给出：
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

## 6. 插件**能**与**不能**强制的东西

**能强制**：入参 schema（闭合；未知键拒绝）、**词法级**项目内路径守卫（见下）、cwd、超时并终止进程、输出上限、回执落盘、插件自身的写域（只写 `Computation/`）、安装两步与作用域默认、同一 archive id 的**串行分配**（并发运行不会共用 attempt 目录）。

**不能强制**（如实声明，勿当成承诺）：
- **路径守卫是字符串级的**：`projectRel` 只做词法规范化（拒绝绝对路径、盘符、`..` 越界），**不做 realpath、不解析符号链接/junction/硬链接**。项目内一个指向外部的链接可以绕过该守卫拿到 `mode:'file'` 的读取与执行；真正的容器化由宿主 `ctx.fs` 后端负责（`resolve`/`contains`），插件不重复实现。审计 A 的用例把这一**限制**钉成了断言（`tests/math-computation-shared.test.mjs` §16c）。
- 脚本内部的网络访问与文件访问——宿主 `subprocess.spawn` **没有 policy 槽**（`env` 层只做凭据/`DSH_*` 清洗与显式合并，不能限制网络或写盘；参见 `dsh-subprocess-local` 的 `runner-launch-*.js` 与 `vibe-math-v5.js` 中 audit M8 注释），任何被执行的计算进程都在宿主 fs 策略之外；
- `mathMode` 只是提示词策略：**模型仍可能直接调用宿主 shell**，插件无法阻止，也无法为 shell 路径生成回执。因此默认策略要求：走 shell 得出的结论必须标注"**未经工具归档（shell 路径）**"，**只有工具路径的计算才算可复核支撑材料**；
- 商业引擎的 CLI 模板随版本变化（Maple 尤甚）：描述符带 `VERIFY` 标记，**每次运行都回显实际 argv**；若引擎以用法/选项错退出，返回 `MATH_ENGINE_BAD_ARGV` + `next.kind='engine-override'`（指向 `mathEngineOverride` 覆盖模板），而不是裸 `MATH_NONZERO_EXIT`。有许可的机器应验证这三个模板。
- 真强制（禁网/限权）需要宿主 sandbox/policy 支持——**列为待上游需求**，不在本轮范围。

**验证边界（诚实声明）**：引擎执行本身、各引擎的真实 argv/版本/许可路径与安装器命令**只通过假 subprocess seam 验证**（`tests/helpers/math-computation-fake-seam.mjs`），**没有**在真实 python/R/octave/julia/matlab/maple/wolfram 上跑过；真机验证需要一台装有这些引擎的机器（安装计划、模板与许可探测的**静态**面已在 `guards.md` 与 parity 守卫里冻结）。

**并发下的完整性**：同一 archive id 的分配与"占用"（receipt.json 落盘）在**一个插件实例内**是串行的，因此两个并发同 id 运行会分别拿到 attempt 1 / attempt 2，绝不会共用目录。**跨进程**并发仍依赖宿主的独占创建原语（当前 fs 接口没有暴露，列为已知限制）。

**父目录由宿主创建（round-3 记录，勿再当缺陷）**：宿主的文本写会**自动创建缺失的父目录**——`dsh-fs-local/lib/index.js` 的 `writeFileAtomic` 在落盘前执行 `mkdir(dirname(absolutePath), { recursive: true })`。因此 `Computation/<runId>/`、`Computation/<runId>/attempts/<n>/` 以及异步作业镜像 `Formal/Jobs/` **不需要预先存在**；`ensureDirs()` 仍然列出它们只是为了空项目里的可发现性（v2/v3/v4/v5 现已都含 `Formal/Jobs` 与 `Computation`）。真机上"严格 fs 拒绝创建父目录"的实验与真实宿主行为矛盾，不能作为失败证据。

## 7. `cli` 逃生口为什么默认开启

模型本来就有宿主 shell 可用（默认 `mathMode='typed+shell'` 就允许把它当兜底），所以 `cli` **不扩大爆炸半径**；区别在于 `cli` 仍在工具内：照样有 cwd、超时、输出上限、路径守卫与回执（`engine` 记为 `cli:<command>`）。要收紧：把 `mathMode` 设为 `typed`，或从 `mathEngines` 去掉 `'cli'`——两种情况下 `engine:'cli'` 都返回 `MATH_REFUSED`。

## 8. 与形式化验证（Lean）的关系

`math_computation` 产出**经验证据**（回执可复核）；形式化证明仍是**可选**的 Lean 路径（`formalVerify: off|encourage|require`，默认 `off`）。计算回执**不能**顶替 Lean 的 `passed`/`blocked`，也不能把对象标为"已验证"。

## 9. 参数配置在哪改

`vibe_math_set_params`（v2/v3）、`vibe_v4_set`（v4）、`vibe_v5_set`（v5）以及各自的控制面：v2/v3 是 `vibe_math_setup`（交互式 schema）/`vibe_math_status`/`vibe_math_template`/`vibe_math_save_settings`，v4 是 `vibe_v4_configure`/`vibe_v4_status`（**没有** `template`/`setup`），v5 是 `vibe_v5_configure`/`vibe_v5_status`（同样没有 `template`/`setup`）；六个参数名在四套、README 双语参数表与本文中拼写一致（由 `tests/audit-math-computation-parity.mjs` 与 `audit-math-computation-contract.mjs` 盯着）。
