# AUDIT CHECKLIST — 成员提示词 / 可见工具 / 实际交互（PHASE 9 / goal 5）

> 人工检查清单；配套命令：`node scripts/slv-inspect.mjs <sessionDirOrJsonl> [--member <id>] [--json]`。
> 本脚本是**诊断工具**，故意**不进** `regen --check`（不执行测试、不写盘、不随机）。

## 1. 硬编码
- [ ] 提示词／设置里有没有**写死的绝对路径**（`C:\`、`D:\`、`/home/`、`/Users/`）？
- [ ] 有没有写死的**端口**、**模型名**、**provider**、**endpoint**？
- [ ] 有没有把**环境命令**（`lean`、`python`、`xelatex`）写成唯一路径，而不是 `vmu.env.needs` 的 probe/配置？

## 2. 参数值与实际不一致
- [ ] 提示词里的**轮数／上限／超时／重试次数**逐个对 `settings/schema.js`（及 pack 默认）的真值；
- [ ] 数字是否由声明派生（而不是手抄）？改了设置后提示词是否仍说旧值？
- [ ] 时间/窗口（`digestWindowMs`、`timeoutMs`）是否单位一致（ms vs s）？

## 3. 教成员调不存在的工具
- [ ] `slv-inspect` 的 **RED tool calls not in wire** 为空；
- [ ] 提示词点名的工具都在该回合 `request/header` 里（提示词 vs wire 双向差集为空）；
- [ ] PTC 模式下，`run_code` 内的 inner calls 被单独列出（不是“未知工具”）。

## 4. 提示词与可见集漂移
- [ ] `slv-inspect` 的 `promptTools missing from wire` / `wire tools not named in prompt` 双向为空；
- [ ] 若这是**刻意的 per-turn `tools.allow`/`none` 覆盖**，清单里要注明覆盖值与该回合目的；
- [ ] 工具名集合的**来源**是实际 header，不是提示词抄写。

## 5. “设了值但没生效”
逐项**读回**（本阶段教训清单）：
- [ ] `vmu.tools.faces`／`vmu.tools.allowAll`（`*` 必须显式确认；status 有 `toolsWildcardInEffect`）
- [ ] `vmu.tools.enabled`（窄化是否真的发生在 wire）
- [ ] `vmu.mailbox.urgentKinds`（空列表是否被尊重；pack 显式值是否仍生效）
- [ ] `vmu.env.needs`（probe 是否用表里的 command/args；`auto:false` 的 CAS 是否默认不探）
- [ ] `vmu.math.*`（`leanCommand`／`leanTimeoutMs`／`formalVerify` 是否进了真实路径）
- [ ] 任何 **pack 默认值覆盖 schema 默认** 的键（先看 pack `settings/defaults.json`）

## 6. 呈现方式是否可见
- [ ] header 里有 `deferLoading` 的工具是否在清单中显式列出；
- [ ] `run_code`（PTC）是否出现；inner calls 是否被归到 PTC 一类；
- [ ] `ptc` 的 `presentAs` / `unapplied` 是否在 status 里可见（没有 `presentAs` 必须是具名 `VMU_ENGINE_UNAVAILABLE`）。
