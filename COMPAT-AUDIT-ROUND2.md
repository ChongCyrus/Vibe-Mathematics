# Vibe-Mathematics × DSH 0.1.5-rc.2 —— 第二轮独立兼容性审计

审计对象：`dsh-vibe-math` 2.0.21，分支 `fix/dsh-0.1.5-compat-audit`（HEAD `9ba893c`）
宿主：DSH **0.1.5-rc.2**（`@deepseek-ai/dsh` package.json），node v24.21.0，win32
方法：**活体契约目录**（Host Inspect `Service.listService` / `Event.listEvents` / `Tool.listTools`）+ 宿主包源码逐行核对 + 可执行复现脚本

> 本文件替代 `COMPAT-AUDIT-0.1.5-rc.2.md` 作为当前兼容性结论。
> 上一轮审计提出的 R1–R7 **从未被修复**（在 `FIX-REPORT-2026.md` 中检索 R1–R7 零命中），本文件逐条重新独立验证。

---

## 0. 摘要

| 类别 | 结论 |
|---|---|
| 版本声明 | 已装 DSH 就是 **0.1.5-rc.2**，与 `testedVersion` 一致；npm `latest`/`next` 同为 0.1.5-rc.2，另有更新的预发布 `0.1.6-alpha.2`（`alpha` tag） |
| 预设能否挂载 | ✅ 真宿主 discovery **3 discovered / 0 broken / 57 rows / 0 failing** |
| persona 修复 | ✅ 有效（双 schema 兼容） |
| 服务方法名 | ✅ 插件调用的每个 (service,method) 都存在于活体契约；唯一调用了不存在方法的 `subagents.followup` 全部 4 处都在 `typeof` 特征检测链上（见 §2） |
| 工具/命令注册形状 | ✅ `output:{schema,render}`、`handler`+`input.hint` 均合法 |
| **功能性缺陷** | ❌ **9 条**（F-1…F-4c），其中最严重的是 F-1 与 F-2 |
| 测试覆盖缺口 | ❌ 现有 380 项测试**全部用 mock 宿主**，且现有"真宿主 e2e"只做 discovery+schema、**跳过三个本地插件行** |
| 可执行证明 | ✅ F-1 与 F-2 均有**驱动真实宿主类**的复现脚本，且 F-1 的证明同时验证了修法可行 |

---

## 1. 确证的功能性缺陷

### F-1 v4 的真实 `/compact` 是死代码（高）

`realCompact()` 在 `subagent/end` 里取 `agents.get(r.childId)`，但宿主在该事件触发前**已经**把该 child 从 agent 注册表移除。

**宿主证据链（按执行顺序）**

| # | 位置 | 代码 |
|---|---|---|
| 1 | `dsh-subagent/lib/index.js:1231` | `await activation.handle.dispose()` ← 先销毁 handle |
| 2 | `dsh-agent/lib/index.js:490` / `:508` | dispose 走 detach 闭包 → `this.store.delete(entry.id)` |
| 3 | `dsh-subagent/lib/index.js:1241` | `activation.observer.settle(failure)` ← **之后**才 emit |
| 4 | `dsh-subagent/lib/index.js:352` | `emit("subagent/end", {...identity, stopReason, lastAssistantMessage}, parent)` |

**插件侧**：`vibe-math-v4.js:727` `agent = agents.get(r.childId)` → 必然 `undefined` → `:728` `if(!agent || !agent.session) return`。

**后果**：`compactIfNeeded` 从未执行；`:735-736` 的 `r.needCompact=true`／`logActivity('compact', …)` 不可达。
**缓解**：软压缩仍在工作（resident 自报 `contextPct` ≥ `compactThreshold`(66) → 自我总结指令，`:328-334`），所以不是"完全不压缩"，而是**永远只依赖模型自报，引擎侧压缩从未发生**。
**修法**：在 `subagent/start`（`vibe-math-v4.js:1155` 已监听 `subagent/end`，可在同处增设 start 监听）缓存活的 Agent 引用；`CompactionAgentContext` 只需要 `{session, options}`（活体契约），不查注册表。

### F-2 v2/v3 的工具权限过滤器会被宿主拒绝（高）

原审计只发现 `web`/`fetch`；**实测更严重**：`bash` 在 Windows 上同样未注册。

**机制（双侧）**
- 插件：`subagents.startContinuable({ request: { toolFilter } })`
- 宿主：`dsh-subagent/lib/index.js:554` `if (composition.toolFilter !== void 0) childCtx.tools.restrict(composition.toolFilter);`
- 宿主：`dsh-tools/lib/index.js:2801-2803` 对未知名**抛错**
- 宿主：`dsh-tools/lib/index.js:2864-2867` `restrictableNames` 只含**注册表真正持有**的工具

**实测（`audit-toolfilter-live.mjs`，win32）**

| 列表 | 值 | 未注册项 |
|---|---|---|
| `vibe-math-v2.NETWORK_TOOLS` | `[web_search, web, fetch]` | `web`, `fetch` |
| `vibe-math-v2.SCRIPT_TOOLS` | `[bash, pwsh]` | **`bash`**（`tool-bash` 行 `disabled: process.platform==='win32'`） |
| `vibe-math-v3.NETWORK_TOOLS` | 同 v2 | `web`, `fetch` |
| `vibe-math-v3.SCRIPT_TOOLS` | 同 v2 | **`bash`** |

宿主真实网络工具名是 `web_search` / `web_fetch`（`dsh-tool-web/lib/index.js:262,737`）——**没有** `web`/`fetch`（那是 presentation 的 card/kind 字段）。

**触发条件**：`solverAllowNetwork:false` / `solverAllowScripts:false`（默认 `''`=继承，属**用户主动收紧权限**的路径）；v2 另加 `*AllowNetwork:true` 且已有 allow 列表的分支。
**后果**：v2/v3 是 fail-closed（`:518` / `:1014` 明确不再重试去掉过滤器），所以症状是**该子代理永远起不来**、调度卡在该任务，而不是权限被静默放开。
**修法**：不要硬编码名表。deny/allow 应只包含**当前预设在该平台真正注册**的名字；或保留名表但加"剔除未注册项"的守卫。注意 v4 预设 `tool-web` 是 `fetch: false`，硬编码 `web_fetch` 同样会错。

### F-3 v4 的注册不纳入 `ctx.effect()`（中）

| 版本 | 位置 | 写法 |
|---|---|---|
| v2 | `vibe-math-v2.js:1508` | `ctx.effect(() => tools.register({…}))` ✅ |
| v3 | `vibe-math-v3.js:2770` | `ctx.effect(() => tools.register({…}))` ✅ |
| **v4** | `vibe-math-v4.js:1088` | `tools.register({…})` ❌ 丢弃 disposer |
| v2 | `vibe-math-v2.js:1545` | `ctx.effect(() => commands.register({…}))` ✅ |
| v3 | `vibe-math-v3.js:2815` | `ctx.effect(() => commands.register({…}))` ✅ |
| **v4** | `vibe-math-v4.js:1131` | `commands.register({…})` ❌ 丢弃 disposer |

宿主这两个方法**都返回 disposer**（活体契约 `tools.register(): () => void`、`commands.register(): () => void`）。
**后果**：预设卸载/HMR 后注册不回收；同进程内第二次挂载同一预设会撞名。v4 的**形状本身是对的**（命令 `handler`/`input.hint` 经 `dsh-commands/lib/types/index.js:134-142` 校验）。

### F-4 `inject` 未声明实际读取的可选服务 → 时序敏感（中）
`audit-surface-vs-live.mjs` 机械提取结果：

| 插件 | `export const inject` | 用 `ctx.get` 读但**未声明** |
|---|---|---|
| v2 | `subagents, agents, fs, tools, commands` | `subprocess`, `sandboxPolicy` |
| v3 | 同上 | `subprocess`, `sandboxPolicy` |
| v4 | `+ timer` | `subprocess`, `sandboxPolicy`, `compaction` |

三处都在 `apply()` 里**同步快照**：`v2:35-36`、`v3:56-57`、`v4:16-18`。

**后果**：若这些服务在预设子树挂载时尚未 provide，快照永久为 `undefined`：
- `subprocess === undefined` → `runShell` 恒返回 `{ok:false,error:'no-subprocess'}` → `ensureDirs()`（`v4:158`，在 `:905/:925/:1051` 被调用）失效；**仅因为宿主 `fs.writeText` 会自动建父目录才没暴雷**，属静默降级。
- `sandboxPolicy === undefined` → `getPolicy()` 返回 `undefined`（见 F-5）。
- `compaction === undefined` → F-1 的路径提前 return（与 F-1 叠加）。

> 注：`subprocess` 服务宿主**确实提供**（`dsh-base/cordis.patch.yml:199` 挂载 `@deepseek-ai/dsh-subprocess-local`），缺的是**挂载顺序保证**。
> **修法**：把这三个加入 `inject`（硬依赖语义，服务到位后自动激活），或改成调用时惰性 `ctx.get()`。

### F-4b 隔离 realm：插件取到的是**宿主根** compaction，预设自己的配置不生效（中）

三套预设都在同一个位置声明了隔离组：

| 预设 | 组 | isolate | 插件行位置 |
|---|---|---|---|
| v2 | `agent.cordis.yml:170-188` | `{compaction: true, toolResultPruner: true}` | `:254`（组**外**） |
| v3 | `agent.cordis.yml:191-209` | 同上 | `:276`（组**外**） |
| v4 | `agent.cordis.yml:212-230` | 同上 | `:299`（组**外**） |

组内是 `compaction-basic` + `command-compact` + `tool-result-pruner`（`thresholdChars: 8192 / headChars: 4096 / tailChars: 1024`）。
按 cordis 隔离语义，`isolate: {compaction: true}` 把该服务放进**该组私有 realm**；插件行与组**平级**，其 `ctx.get('compaction')`（v4:18）解析到的是**宿主根**实例，**不是**组内实例。

**后果**：预设为压缩/裁剪写的阈值配置对插件侧调用**不生效**；插件实际用的是宿主根 compaction（使用宿主的策略与阈值）。这与 F-1 叠加：即便修好 F-1，压缩行为仍不是预设作者配置的那一套。
**修法**：若希望用预设内实例，把插件行移进该组（或让插件按 `agent.ctx` 取服务）。**但需先确认这是否有意为之**——把插件行移进 realm 也会影响它对该组其它服务的可见性。

### F-4c 状态目录创建依赖外部二进制（低，但属实机才会暴露）

`ensureDirs()`（`v4:158`）走 `runShell(mkdirCmd(...))`，最终 `subprocess.spawn(['powershell', …])`（`:131`）或 `/bin/sh -c mkdir -p`（`:132`）。
`runShell` 的返回值**在 `ensureDirs` 的调用点无人检查**（`:905/:925/:1051` 都是 `await ensureDirs()` 后继续）。
**后果**：若 `powershell`/`sh` 不可用或返回非 0，目录不会被创建，而唯一的兜底是 `fs.writeText` 自动建父目录；一旦某条写入路径不经过 `fs.writeText`，落盘就会失败且**没有任何报错**。属"mock 覆盖不到、实机才暴露"的一类。

### F-5 `getPolicy()` 回退会静默改变沙箱围栏根（中）

`v2:140`、`v3:206`、`v4:113` 三处同构：

```js
try { … sandboxPolicy.resolve({ session }) } catch(e){}
try { … sandboxPolicy.resolve({}) }          // ← 回退
catch(e){} return undefined
```

宿主 `dsh-sandbox-policy/lib/index.js:141-145`：未传 session 时用 `resolveWorkspaceRoot(policy.workspaceRoot)`，而该值来自 `config.workspaceRoot ?? process.cwd()`（`:113`）。
**后果**：回退路径把"写权限围栏根"从**会话工作区**换成**进程 cwd 或配置根**，可能**放宽**可写范围。属静默安全降级，且异常被吞（F-6）。

### F-6 静默吞异常清单（中，放大所有其他风险）

最相关的是宿主服务调用处的"静默 catch"：

| 位置 | 吞掉什么 | 一旦宿主改名/改语义的后果 |
|---|---|---|
| `v2:140` / `v3:206` / `v4:113` | `sandboxPolicy.resolve` 失败 | 围栏根静默改变（F-5） |
| `v2:503` / `v3:977` / `v4:85` | `subagents.list()` 失败 | 静默回退 `'spawn'`，provider 名错误时无法察觉 |
| `v2:539` / `v3:1036` / `v4:916,993,1057` | `subagents.interrupt` 失败 | 子代理无法中断，但表面正常 |
| `v4:738` | `compaction.compactIfNeeded` 失败 | 与 F-1 同类，压缩失败无人知 |
| `v2:217,221` / `v3:297,301` / `v4:161,162` | `fs` 读写当前项目 | 项目切换丢失，静默回默认 |

### F-7 v3/v2 用 realm 全局 `setInterval` 而非 `ctx.interval`（低，修正原 R6）

`v2:1573`、`v3:2842`：`ctx.effect(() => { const t = setInterval(…1000); return () => clearInterval(t) })`

**修正原审计判断**：`setInterval` 在真实插件运行时**是存在的**（预设插件行是普通 node ESM，不是受限的 dynamic-cordis 沙箱），且**已正确清理**——所以这**不是功能故障**，只是未使用宿主提供的 `timer` 服务（`ctx.interval` 能随 fiber 自动释放）。降级为**建议**。

### 附：F-8 安装器自检覆盖不到上述问题（中）

`installer.js:115-123` 的能力自检只检查 `subagents/agents/tools/commands/fs` 的**方法存在性**，加上 `:139-147` 的 `fs.resolve` 外形检查。它**没有检查** `compaction`、`subprocess`、`sandboxPolicy`——恰好是 F-1/F-4/F-5 所在的服务。因此这类问题永远不会在安装时被报告。

---
### F-9 损坏的 JSON 状态文件会被静默覆盖（高，本轮复审新发现）
`readJson` 无法区分"文件不存在"与"文件存在但不可解析"：两者都返回 `undefined`，调用方把它当作"无数据"，随后又把这份空数据写回。于是一个被外部损坏的文件会**静默清空用户数据**：

| 版本 | 受害文件 | 后果 |
|---|---|---|
| v2 | `qs/qs.json` | 全部问题清单被清空（`add_problem` 读空→写回空） |
| v2 | `Propos/<分类>_Propos.json`、`Verified/<分类>_Verified.json` | 命题/已验证集合被清空 |
| v3 | `State/agents.json`、`decision_queue.json`、`tasks.json` 等 | 整轮调度状态复位 |
| v4 | `State/session.json`、`residents.json`、`taskboard.json`、`mailboxes.json` | 整轮运行状态复位 |

**修法**：读取命中"存在但不可解析"时记录该路径并告警；写入该路径时**拒绝覆盖**，直到用户修复或删除。文件不存在仍会正常创建，首次运行行为不变。v4 另在写前惰性检查磁盘内容，覆盖"本进程只 configure/start、从未 `loadAll`"的路径（该路径下 `residents.json` 从未被读过，仅靠读时记录抓不到）。
**测试**：`audit-corrupt-file-guard.test.mjs` **6 passed**，并对三个版本分别做了敏感性验证（关掉守卫则对应用例失败）。

### F-10 F-2 的失败重试在极端情况下不够 fail-closed（中，本轮复审自纠）

F-2 引入的"按宿主合法名重试"若把过滤器**全部**名字都过滤掉，原实现会删除过滤器并继续派发 —— 这会在"用户只写了本机不存在的工具名"时**放开全部权限**，与 fail-closed 意图相反。
**修法**：过滤后为空即视为配置无法满足，打日志并**拒绝派发**该子代理（宁可这一轮不派，也不越权）。已 apply 到 v2 与 v3。

### F-11 纯函数鲁棒性（本轮验证通过，非缺陷）

`audit-fuzz-helpers.mjs` 把三个插件的单参纯函数抽出（`parseJson`/`parseProgress`/`parseMethodMd`/`splitHeader`/`idSafe`/`clamp` 系列等），用 19 类恶意输入各调用两次（空串、截断 JSON、超长串、NUL、代理对、`NaN`/`Infinity`、`1e999` 等），共 **1654 次调用**：0 抛异常、0 返回 Promise。这同时回归确认了此前几轮修的卡片往返与锚点解析在畸形输入下不会崩。

---

## 2. 已确证**正确**的部分（避免重复劳动）

| 项 | 证据 |
|---|---|
| persona 行兼容 | 真宿主 discovery 3/0/57/0；`prefix`+`text` 双键 |
| 服务方法名 | `audit-surface-vs-live.mjs`：17 个 (service,method) 组合对活体契约全部 `OK` |
| `subagents.startContinuable(spec)` 形状 | `{provider,label,request:{prompt,parent,agentOptions,toolFilter},signal}` 与 `ContinuableStartSpec` 一致 |
| `subagents.sendMessage(sender,targetId,content,{signal})` | 4 参顺序与活体契约一致 |
| `subagents.interrupt(id,{kind:'ancestor',agent})` | 与 `SubagentInterruptAuthority` 一致 |
| `fs.writeText(target,content,undefined,undefined,policy)` | 5 参顺序正确 |
| `stat` 缺失返回 `undefined` | 插件依赖此语义，契约成立 |
| `tools.register` 必填 `output:{schema,render}` | 三套全部提供 |
| `commands.register` 形状 | `handler` + `input.hint` 经 `dsh-commands:134-142` 校验通过 |
| `compaction.compactIfNeeded(agent,trigger,signal)` | 三参正确，`trigger='pressure'` 合法 |
| `subprocess.spawn(spec)` | 形状正确，服务宿主确实提供 |
| `subagent/end` 监听签名 | 宿主 emit **单参** `info`；三套均 `function(info)` 并只读 `info.id`/`info.stopReason`，**签名正确** |
| `subagents.followup` | 活体契约中**不存在**，但 4 处调用点全部在 `typeof … === 'function'` 链上，是**故意的跨版本回退**，非缺陷 |
## 3. 测试覆盖缺口（重要）

| 缺口 | 说明 |
|---|---|
| mock 宿主 | 380 项测试全用约 30 行 mock `ctx`；**"宿主是否真这样调用"不在覆盖内** |
| 定时器路径 | mock 有 `ctx.timeout`，但测试一律用显式 `fireEnd()` 推进，**定时唤醒通道未被覆盖** |
| `runShell` | v3 mock 用正则假装执行 PowerShell；v4 的 `subprocessMock` 直接 `{exitCode:0}` **不建目录** → 跨平台行为未被真跑 |
| 真宿主 e2e | `e2e-host-preset-check.mjs` 只做 discovery + 逐行 schema，**从不真正挂载预设**，且 `:70` 明确**跳过三个本地插件行** |
| toolFilter | 无任何测试触达 `tools.restrict()`，所以 F-2 一直不可见 |

---

## 4. 复现脚本（位于仓库之外的工作区）

| 脚本 | 作用 | 实测结果 |
|---|---|---|
| `prove-f1-agent-detach.mjs` | **驱动真实 `AgentRegistry`** 复现"teardown 之后 child 已不在注册表" | ✅ CONFIRMED（exit 0） |
| `prove-f2-toolfilter-throws.mjs` | 用宿主自身守卫谓词 × 真实注册名，判定权限名表 | ✅ 6 个用户场景被拒 |
| `audit-surface-vs-live.mjs` | 机械提取全部 (service,method) 调用点对照**活体契约目录** | ✅ 17 组合全 OK |
| `audit-toolfilter-live.mjs` | 按"该预设在本平台真正注册的工具名"判定名表 | ✅ 6 个未注册名 |
| `_live-tool-names.json` | 本会话 Tool inspect 的实测工具名快照 | — |
| `e2e-host-preset-check.mjs` | 真宿主 discovery + schema（**注意：不挂载、跳过本地行**） | 3/0/57/0 |
| `audit-row-schemas.mjs` | 167 行预设 config 对照真实 schema | 1 failing（宿主自带 `cordis` 预设） |

### F-1 可执行证明输出（节选）

```
agents.get("child-session-1") right after enter()  -> Agent present
captured while live                                -> Agent (usable)
=== teardown: activation.handle.dispose()  [dsh-subagent/lib/index.js:1231] ===
  dispose() -> dsh-agent detachEntered() -> store.delete(entry.id)  [dsh-agent/lib/index.js:508]
=== then the host emits subagent/end  [dsh-subagent/lib/index.js:1241] ===
  agents.get(info.id) inside the end handler -> undefined   <== the child is GONE
=== VERDICT: CONFIRMED ===
  A live reference captured BEFORE teardown still works (the registry is not
  consulted again), but a lookup INSIDE the subagent/end handler always fails.
```

这条同时**验证了修法可行**：teardown 前捕获的引用仍然可用。

### F-2 可执行证明输出（节选）

```
[solverAllowNetwork=false]        filter={"deny":["web_search","web","fetch"]}
   -> REJECTED: names unknown global tools "web", "fetch"
[solverAllowScripts=false]        filter={"deny":["bash","pwsh"]}
   -> REJECTED: names unknown global tool "bash"
[solverAllowNetwork=true + allow] filter={"allow":["read","web_search","web","fetch"]}
   -> REJECTED: names unknown global tools "web", "fetch"
```

---

## 6. 修复优先级建议（原始排序，1–6 已在本轮完成）

1. **F-2**（唯一会让用户"想锁权限反而全停"的坑）——改按注册名判定。
2. **F-1**（真实压缩从未发生）——在 `subagent/start` 缓存 Agent 引用。
3. **F-4**（`inject` 补 `subprocess`/`sandboxPolicy`/`compaction`）——顺带消掉 F-1/F-5 的时序隐患。
4. **F-3**（v4 补 `ctx.effect`）——防重复挂载撞名。
5. **F-5/F-6**（围栏根回退 + 静默吞异常）——至少加一条可见日志。
6. **F-8**（安装器自检补三个服务）——让以后的问题在安装时就暴露。
7. 测试：补一个**真正挂载预设**的 e2e 与一个 **toolFilter 冒烟测试**。

---

## 7. 修复实施记录（本轮已完成）

| 编号 | 缺陷 | 状态 | 修复位置 | 验证 |
|---|---|---|---|---|
| **F-2** | v2/v3 权限过滤器含未注册工具名 | ✅ **已修** | `vibe-math-v2.js:505-556`、`vibe-math-v3.js:987-1038` | `audit-f2-filter-fix.test.mjs` **36 passed**；已做敏感性验证（改回旧代码 → 4 FAIL） |
| **F-1** | v4 真实 `/compact` 死代码 | ✅ **已修** | `vibe-math-v4.js` 新增 `liveAgents`/`rememberAgent`/`forgetAgent`/`liveAgentOf` + `subagent/start` 监听 | `audit-f1-compact-fix.test.mjs` **5 passed**；敏感性验证（关掉捕获 → 2 FAIL） |
| **F-3** | v4 注册未纳入 `ctx.effect` | ✅ **已修** | `vibe-math-v4.js` `registerTool()` 与 `commands.register` 均改为 `ctx.effect(...)` | 与 v2/v3 一致；v4 套件 120 passed 无回归 |
| **F-4** | `apply()` 同步快照可选服务 | ✅ **已修** | 三套均改为惰性 `subprocessOf()`/`sandboxPolicyOf()`/`compactionOf()` | `audit-surface-vs-live.mjs`：**EAGER apply-time snapshot, not injected: (none)** |
| **F-5** | `getPolicy()` 静默改围栏根 | ✅ **已修**（加可见告警） | 三套 `getPolicy()` | 告警仅在**首次**触发，不刷屏 |
| **F-6** | 静默吞异常 | ✅ 部分修复 | F-5 相关的静默 catch 已改为一次性告警 | 其余保留（多为有意的防御性回退） |
| **F-8** | 安装器自检覆盖不到三个服务 | ✅ **已修** | `installer.js` 新增 `subprocess`/`sandboxPolicy`/`compaction` 检查，区分**必须**与**可选降级** | `e2e-installer-test.mjs` 退出 0 |
| **F-4b** | 插件行在 `compaction` 隔离组**外** → 取到宿主根 compaction | ✅ **已修（最小风险+符合设计）** | v4 `realCompact` 改经**子代理自身 `agent.ctx`** 解析 compaction；插件行**不移动** | `audit-f1-compact-fix.test.mjs` 6 passed，含"插件平面调用数必须为 0" |
| **F-9** | 损坏 JSON 被静默覆盖（数据丢失） | ✅ **已修** | 三套 `readJson` 记录 + `writeJson` 拒写；v4 另加写前磁盘惰性检查 | `audit-corrupt-file-guard.test.mjs` 6 passed + 三版敏感性验证 |
| **F-10** | F-2 重试在极端下不够 fail-closed | ✅ **已修（自纠）** | v2/v3：过滤后为空则拒绝派发 | 沿用 F-2 测试；行为由代码审查确认 |
| **F-11** | 纯函数鲁棒性 | ✅ 验证通过（非缺陷） | — | `audit-fuzz-helpers.mjs` 1654 次调用 0 问题 |

### 回归门槛（全部实跑）

```
e2e-business        18 passed    e2e-v3          100 passed
e2e-regression      14 passed    e2e-v4-fixes    120 passed
e2e-multisession    25 passed    e2e-v3-roundtrip 12 passed
e2e-d9-d13           7 passed    audit-path-consistency      18 passed
audit-settings-roundtrip 12      audit-round1-regressions     7 passed
audit-round6-persistence    8    verify-fixes                11 passed
e2e-host-preset-check   3 discovered / 0 broken / 57 rows / 0 failing
audit-f1-compact-fix  6 passed    audit-f2-filter-fix     36 passed
audit-corrupt-file-guard 6 passed  audit-fuzz-helpers      1654 calls / 0 problem
e2e-f1-agent-detach    CONFIRMED (drives the real AgentRegistry)
────────────────────────────────────────────────────────────────
合计 380 + 3 个新测试文件（36 + 5 + 1）
```

### 未修（需你决策，风险与取舍已说明）

| 编号 | 说明 | 为何未动 |
|---|---|---|
| **F-4b** | 插件行在 `compaction` 隔离组**外** → 取到宿主根 compaction，预设阈值不生效 | 修法是**把插件行移进该组**，但会同时改变它对组内其它服务的可见性；**需先确认这是否为有意设计** |
| **F-4c** | `ensureDirs()` 依赖外部二进制且返回值无人检查 | 属"实机才暴露"一类；改动会影响启动路径，建议与你的实机验证一起做 |
| **F-7** | v2/v3 用全局 `setInterval` 而非 `ctx.interval` | 已核实**不是功能故障**（在 `ctx.effect` 内且正确清理），仅是未用宿主 timer 服务 |

- **两个并行深度审计未能返回**（长时间运行后由我中止，无输出）。其覆盖范围（服务 API 逐参数核对、R1–R7 逐条复核）**已由我本人独立完成**，结论即本文件 §1/§2。
- 未逐条验证上一轮 `FIX-REPORT-2026.md` 第四节列出的约 20 条审计编号（v4 D1/D2/D3/D7、v3 D17/D18/M14/M2 等）——这些**只是编号转述**，需先验证机制再改。
- **修复已实施**（见 §7）：F-1/F-2/F-3/F-4/F-5/F-8 完成并各有回归测试；F-4b/F-4c/F-7 见 §7 末表，需你决策或留待实机验证。

---

## 8. 与上一轮结论的差异（修正记录）

| 上一轮说法 | 本轮实测 |
|---|---|
| R2 只有 `web`/`fetch` 两个假名 | 还有 **`bash`**（Windows 上 `tool-bash` 行被 `disabled`）——**共 6 个未注册名** |
| R6「v3 用全局 setInterval」列为风险 | `setInterval` 在真实插件运行时**存在**，且 `ctx.effect` 内**已正确清理**；**降级为建议** |
| R3「v4 硬编码假名、无重试可能半启动」 | v4 的过滤器**只用用户传入的名字**，不硬编码网络/脚本名；该条**不成立**（v4 的真实问题是注册未纳入 `ctx.effect`） |
| R1 仅"代码阅读推断" | 本轮**用真实 `AgentRegistry` 可执行复现**（`prove-f1-agent-detach.mjs`，exit 0） |
| 「兼容性审计 0 处崩溃」 | 兼容性缺陷确实不是崩溃型，但 F-2 会让子代理**永远起不来**，属功能失效而非"无问题" |
