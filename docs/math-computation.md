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
- 策略类拒绝（`mathMode:'typed'` 下的 `cli`、`cli` 不在 `mathEngines`、`cli` 缺 `command`、`mode:'expr'` 配 `cli`、路径越界）都是 `MATH_REFUSED` **且带 `next:{kind:'reason', reason:…}`**（`policy` / `engine-not-allowed` / `missing-cli-command` / `expr-not-supported` / `path-outside-project`），调用方不必解析文案。

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

## 5. 安装：两条路径

1. **用户自己装**：工具在缺引擎时返回逐 OS 命令（Windows/macOS/Linux）与官方链接；商业引擎只给厂商安装包与激活说明。
2. **代理代装**：`plan → confirm`（token 绑定该计划，内容变了就失效）；默认 **user 作用域**（`pip --user`、用户 depot、`R_LIBS_USER`、Octave 用户包目录…）；**system 作用域必须每次显式指定且不被记住**；每次执行写审计 `Computation/installs/<planToken>.json`（计划、作用域、管理器、命令、退出码、before/after、卸载命令模板）。

**诚实的回滚说明**：包安装**没有通用回滚**。工具保证的是——记下确切命令与 before/after 版本（卸载**可验证**）、默认 user 作用域限制影响面、提供各管理器的卸载模板；**不做**自动回滚。

## 6. 插件**能**与**不能**强制的东西

**能强制**：入参 schema（闭合；未知键拒绝）、项目内路径守卫、cwd、超时并终止进程、输出上限、回执落盘、插件自身的写域（只写 `Computation/`）、安装两步与作用域默认。

**不能强制**（如实声明，勿当成承诺）：
- 脚本内部的网络访问与文件访问——宿主 `subprocess.spawn` **没有 policy/env 槽**（参见 `vibe-math-v5.js` 中 `removeArchivedProof` 的 audit M8 注释），任何被执行的计算进程都在宿主 fs 策略之外；
- `mathMode` 只是提示词策略：**模型仍可能直接调用宿主 shell**，插件无法阻止，也无法为 shell 路径生成回执。因此默认策略要求：走 shell 得出的结论必须标注"**未经工具归档（shell 路径）**"，**只有工具路径的计算才算可复核支撑材料**；
- 商业引擎的 CLI 模板随版本变化（Maple 尤甚）：描述符带 `VERIFY` 标记，**每次运行都回显实际 argv**；若引擎以用法/选项错退出，返回 `MATH_ENGINE_BAD_ARGV` + `next.kind='engine-override'`（指向 `mathEngineOverride` 覆盖模板），而不是裸 `MATH_NONZERO_EXIT`。有许可的机器应验证这三个模板。
- 真强制（禁网/限权）需要宿主 sandbox/policy 支持——**列为待上游需求**，不在本轮范围。

## 7. `cli` 逃生口为什么默认开启

模型本来就有宿主 shell 可用（默认 `mathMode='typed+shell'` 就允许把它当兜底），所以 `cli` **不扩大爆炸半径**；区别在于 `cli` 仍在工具内：照样有 cwd、超时、输出上限、路径守卫与回执（`engine` 记为 `cli:<command>`）。要收紧：把 `mathMode` 设为 `typed`，或从 `mathEngines` 去掉 `'cli'`——两种情况下 `engine:'cli'` 都返回 `MATH_REFUSED`。

## 8. 与形式化验证（Lean）的关系

`math_computation` 产出**经验证据**（回执可复核）；形式化证明仍是**可选**的 Lean 路径（`formalVerify: off|encourage|require`，默认 `off`）。计算回执**不能**顶替 Lean 的 `passed`/`blocked`，也不能把对象标为"已验证"。

## 9. 参数配置在哪改

`vibe_math_set_params`（v2/v3）、`vibe_v4_set`（v4）、`vibe_v5_set`（v5）以及各自的 `*_setup`/`status`；六个参数名在四套、README 双语参数表与本文中拼写一致（由 `tests/audit-math-computation-parity.mjs` 与 `audit-math-computation-contract.mjs` 盯着）。
