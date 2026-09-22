# v2.0.22 — 兼容性修复与数据安全加固

> 目标宿主：**DSH 0.1.5-rc.2**（`dsh.testedVersion`）。`minVersion` 仍为 `0.1.2-rc.1`。
> 本版**无破坏性改动**，升级路径与以往一致（`dsh plugin update dsh-vibe-math` 后重启 DSH）。
> 三套预设（v2 / v3 / v4）**都要更新**。
>
> 本版包含自 v2.0.21 以来的全部改动：**① DSH 0.1.5-rc.2 兼容性修复**（下文第一部分）与
> **② 上一轮深度审计修复**（本文件末尾「附：v2.0.21 之后的审计修复」）。

## ⚠️ 升级前请先读这一条（可能影响你的数据）

**v2.0.21 及更早存在一个数据丢失缺陷**：当项目里的 JSON 状态文件被外部损坏（手工编辑出错、磁盘写入中断、编辑器崩溃等）时，插件会把"无法解析"误当成"文件不存在"，随后用空数据把它覆盖掉 —— 表现为**问题清单/命题库/运行状态被静默清空**。

本版修好了这个缺陷，但**它无法恢复已经被清空的历史数据**。如果你曾遇到过"知识库内容无故消失"，请注意：

- 该缺陷的影响面：v2 的 `qs/qs.json`、`Propos/*.json`、`Verified/*.json`；v3/v4 的 `State/*.json`。
- 修复后的行为：一旦检测到"文件存在但无法解析"，插件会**打印告警并拒绝覆盖该文件**，等你修复或删除它。
- 因此升级后如果看到 `exists but is not parseable JSON — REFUSING to overwrite it` 之类的日志，说明该文件本来就是坏的：请先修好或重命名它，插件才会继续写入。

## 修复清单

### 兼容性（针对 DSH 0.1.5-rc.2）

| 项 | 问题 | 影响 |
|---|---|---|
| **工具权限过滤器被宿主拒绝** | v2/v3 的权限名表硬编码了 `web`/`fetch`（**从来不是工具名**），且 `bash` 在 Windows 上因预设 `disabled: process.platform==='win32'` 未注册。宿主 `tools.restrict()` 对未注册名**直接抛错**，而过滤器是在建立子代理时应用的 | **想收紧网络/脚本权限时（`solverAllowNetwork:false` / `solverAllowScripts:false`）子代理永远起不来**，调度卡住。已改为按本平台真实注册名，并加"只保留宿主确认合法的名字"的带守卫重试；过滤后若为空则**拒绝派发**（宁可这一轮不派，也不越权） |
| **v4 的真实 `/compact` 是死代码** | `realCompact()` 在 `subagent/end` 里查 `agents.get(childId)`，但宿主时序是「先 `handle.dispose()` → 子代理移出注册表 → 之后才 emit `subagent/end`」，查询**必然** 返回 undefined | 真实压缩**从未执行**，上下文只靠模型自报占比。已改为在 `subagent/start` 捕获活 Agent 引用（`WeakRef` 持有，end 处理后释放） |
| **预设 realm 配置不生效** | compaction 隔离组的用途（DSH 自带 `standard` 预设注释原话）是"让预设决定自己的 agent 是否/如何压缩"，但插件行在 realm 之外，取到的是**宿主根**实例 | 插件代常驻发起的压缩用的是宿主配置，与常驻自压的实例不一致。已改为经**子代理自身 `agent.ctx`** 解析，两条路径落到同一实例 |
| **可选服务在 `apply()` 同步快照** | `subprocess`/`sandboxPolicy`/`compaction` 在挂载时一次性读取，受挂载顺序影响会永久为 `undefined` | `runShell` 静默失效、`ensureDirs()` 不再建目录（仅被 `fs.writeText` 自动建父目录掩盖）。已改为**惰性读取** |
| **v4 注册未纳入 `ctx.effect`** | `tools.register`/`commands.register` 的 disposer 被丢弃 | 预设卸载/HMR 后注册不回收、重复挂载会撞名。已与 v2/v3 一致地纳入 `ctx.effect` |
| **安装器自检漏检三个服务** | 原先只查 `fs.resolve` 外形 | 现在把 `subprocess`/`sandboxPolicy`/`compaction` 也纳入自检，并区分**必需**（缺失即告警）与**可选降级**（只提示降级、不影响挂载） |

### 数据安全 / 正确性

| 项 | 问题 |
|---|---|
| **损坏 JSON 被静默覆盖**（见上"升级前请先读"） | 三套预设均已加"读取时记录 + 写入时拒写"守卫；v4 另在写前惰性检查磁盘内容，覆盖"只 configure/start、从未 `loadAll`"的路径 |
| **沙箱围栏根静默改变** | `getPolicy()` 的 `resolve({})` 回退会把围栏根换成宿主配置的 workspace（不一定是本会话 cwd），且异常被静默吞掉。现在首次触发即打印可见告警 |
| **fail-closed 自纠** | 上一条"重试"若把过滤器全部名字都过滤掉，原实现会删掉过滤器继续派发（等于放开全部权限）。已改为拒绝派发 |

### 文档

- README 修正：`push` 汇报走的是 `subagents.sendMessage(...)`，**不是** `rootAgent.followup()`（`followup` 只是 `Agent` 对象方法，不是 `subagents` 服务方法）。
- 补全宿主服务清单（`tools.restrict`、`agents.get`、可选 `compaction`）与 2026 兼容性修复要点。
- 设计文档（v4 `实现方案.md`）更新：记录真实 `/compact` 的原缺陷与修法。

## 验证

本版在 DSH **0.1.5-rc.2** 上实跑：

```
e2e-business 18 / e2e-regression 14 / e2e-multisession 25 / e2e-v3 100 / e2e-v4-fixes 120
e2e-v3-roundtrip 12 / e2e-d9-d13 7 / audit-path-consistency 18
audit-settings-roundtrip 12 / audit-round1-regressions 7 / audit-round6-persistence 8
verify-fixes 11                                    → 原有 380 项断言全绿

audit-f1-compact-fix 6        （mock 忠实复现宿主"先 teardown 再 emit"，断言真实压缩被调用）
audit-f2-filter-fix 36        （用宿主自身拒绝谓词 × 本部署真实注册名）
audit-corrupt-file-guard 6    （损坏文件不被覆盖；三版本各做敏感性验证）
audit-fuzz-helpers 1654 calls （单参纯函数 × 19 类恶意输入，0 抛异常）
e2e-f1-agent-detach CONFIRMED （驱动真实 AgentRegistry 复现宿主时序）

真宿主检查：3 discovered / 0 broken / 57 rows / 0 failing
隔离 DSH_HOME 安装器全链路：通过（真实 ~/.dsh 未被触碰）
```

其中 F-1/F-2/F-9 三个修复都做了**敏感性验证**：把代码改回缺陷版本后，对应测试确实会失败 —— 证明这些测试不是空洞通过。

## 已知边界（沿用，未在本版改动）

- `ensureDirs()` 依赖外部 `powershell`（Windows）/`sh`（其他平台），且返回值在调用点未被检查；兜底是 `fs.writeText` 自动创建父目录。
- v2/v3 的 tick 定时器用 Realm 全局 `setInterval`（在 `ctx.effect` 内且正确清理）而非宿主的 `ctx.interval`，仅为风格问题。
- v4 的 `claim_write`/`release_write` 仍是占位（常驻专属目录天然无写冲突）。
- `FIX-REPORT-2026.md` 第四节约 20 条历史审计编号（v4 D1/D2/D3/D7、v3 D17/D18/M14/M2 等）**未逐条验证**，不属本次兼容性范围。

## 详细审计报告

仓库内 `COMPAT-AUDIT-ROUND2.md`（含逐条证据与行号、与上一轮 `COMPAT-AUDIT-0.1.5-rc.2.md` 的差异修正）。

---

## 附：v2.0.21 之后的审计修复（同版本发布，非本部分兼容性范围）

以下为 v2.0.21 之后、随本版一同发布的上一轮深度审计修复。详细证据见仓库 `FIX-REPORT-2026.md`。

**宿主兼容性（persona schema）**
- 三套预设的 `persona` 行从仅 `text:` 改为 **`prefix`（正文）+ `suffix`（cwd 句）+ 保留 `text`**：DSH ≥ 0.1.3-alpha.2 起 `prefix` 为必填，而 ≤ 0.1.2 只认 `text`；schemastery 容忍未知键，故一行同时兼容两代。**未修前，本项目在 DSH 0.1.5-rc.2 上完全无法挂载。**

**v2**
- **收敛闸门**：「判断命题」的收口路径让命题**永不收敛**，每 tick 重开辩论并饿死其它工作。
- **fail-closed**：工具过滤器失败时不再删掉过滤器重试（那会静默放开网络/脚本权限）。
- **平台 shell**：按平台选择解释器（原先硬编码 `powershell`，非 Windows 静默失效）。
- **参数下界**：整数字段补下界（如 `maxParallelThreshold:0` 会导致永不派发）。
- **设置模板合法化**：写出的模板含 `"mode": undefined` 等非法 JSON，导致插件自己回读失败、**用户参数静默丢失**。

**v3**
- **卡片无损往返**：往返会销毁代理产出（`经验与教训`、方法卡`改进历史`、应用记录`问题/方向`）。
- **路径消毒与单一来源**：原先写用 `idSafe`、读用原始 id，导致**读写路径不一致**（路径穿越）。
- **重派生计数**：`explorerRetries` 只增不减（重置点是死代码），3 次后**永久无法重派生**。
- **停摆判定**：人工计划待批时被判「停摆」，approve 后计划**永不执行**。
- **gate 单点设置**：gate 被无条件覆盖产生幽灵 pending 决策，会被 `auto` **重放副作用**。

**v4**
- **`maxParallel` 下界钳制**：`0` 会使闸门失效 → **无限并发**。
- **平台 shell**：同 v2。

**缺陷分类（D9 / D13 / D21 等）**
- `activeCount` 手写累加器漂移 → 闸门恒真、**永不派发**，而 status 仍报 running。
- `scheduler.gate` 粘滞 → 调度**永久卡死**且重启带病。

> 本部分改动均带有回归测试。原有测试套件在本版发布前实跑全绿（见上「验证」）。

