# Vibe-Mathematics × DSH 0.2.0-rc.2 —— 第三轮兼容性审计（适配记录）

> 本轮目标：把四套预设适配 **DSH 0.2.0**（当前版本），同时保住旧版本线；并在过程中把"版本线切换"这件事
> 从"猜"变成"能力探测 + 四宿主实测"。结论先行：**0.2.0 的破坏性变更不是 API 签名**，而是三类：
> ① 预设交付**形态换代**（旧的目录发现被彻底删除）；② 新增**硬性行为**（会话事件白名单、子代理数量上限、
> 工具名抛错、压缩的"策略 vs 执行"语义）；③ 兼容性判定从 `engines` 扩展为 `peerDependencies`。

---

## 0. 摘要

- 并行做了 4 份契约审计（组合行与声明 / `subagents`+`agents`+事件 / `tools`+`commands`+`timer` / `compaction`+`sessionProjections`+`sessions`+`subprocess`+`sandboxPolicy`），
  每份都以**已安装的 0.2.0-rc.2 源码**（`lib/**/*.d.ts` 与实现）为证据。
- 另外做了**四宿主实测**：把本包分别装进 `0.1.5-rc.2`、`0.1.6-alpha.2`、`0.1.7-rc.2`、`0.2.0-rc.2` 的独立 `DSH_HOME`，
  启动后用宿主自己的 `agentPresets.list()` 读回预设清单。这是"预设到底有没有出现在选择器里"的唯一可信判据。
- 结果：修复后四条版本线上预设**都**会出现（旧线走目录、新线走声明行），且新线上**零激活警告**。

---

## 1. 确证的缺陷

### G-1 preset 在新宿主上完全不可见（致命，2.3.x 全线命中）

DSH 0.1.7 起 agent preset **只**由组合行声明；`$DSH_HOME/.agent-presets/<id>/agent.cordis.yml` 已无人读取
（宿主自带技能 `editing-cordis-compositions` 明写 "Nothing reads that directory any more"）。2.3.x 的安装器
在新宿主上仍会写那个目录：**日志显示安装成功、`~/.dsh/.agent-presets/` 里文件齐全，选择器里却一个都没有。**
修复：`cordis.patch.yml` 声明四个组合行；安装器的形态判定改为读 **loader 入口树**（见 G-10）。

### G-2 组合行声明有三条硬约束（每条都实测过）

| 约束 | 违反后的现象 | 证据 |
|---|---|---|
| `dsh.bundle.patch` 必须是**字符串** | 0.1.5/0.1.6 把该值直接送进 `path.join` → `ERR_INVALID_ARG_TYPE`，**整个 profile 起不来** | 实测：数组形态在 0.1.5-rc.2 上必然崩 |
| 声明行不能命名**宿主包**（如 `@deepseek-ai/dsh-agent-preset`） | 旧线无此包 → 每次启动 `failed to import` 激活失败 | 实测：0.1.5/0.1.6 上该包不存在 |
| 声明行不能用 **`!!js` 门**（表达式里调 `ctx.get`） | 入口**永不初始化**、预设静默不注册（`N entries did not activate`） | 实测 0.2.0：`!!js "false"` / `typeof ctx` 正常；`ctx.get('fs'\|'agents'\|'pluginManager'\|'agentPresets')` 全部让入口不加载 |

因此本包改为：声明行的模块是**自己**的 `preset-declaration.js`（两条线上都可解析），它在运行时读 `agentPresets`
服务——有就注册，没有就**什么都不做且不报警**。

### G-3 声明行里的相对 `name` 解析不到（B3）

`app-boot` 只会把 `group && Array.isArray(config)` 的条目名改写成 `file://` URL；声明行的 `config.plugins`
不在其中，loader 便拿**profile 目录**解析 `./vibe-math-vN.js` → ENOENT → **整个 preset 拒绝挂载**。
修复：改用包内子路径 `dsh-vibe-math/vibe-math-vN/vibe-math-vN.js` + 在 `exports` 放行。

### G-4 v5 把状态写进宿主会话日志 → 用户会话不可恢复（致命，数据安全）

`Session.append(type,data,…)` 构造信封时**无法**设置 `ignorable`（只有构造种子接受该字段）；而会话持久化在加载时
要求"未知事件类型必须 `ignorable === true`"，否则抛 `SessionFormatUnsupportedError` **拒绝整个会话**。该规则在
0.1.5-rc.2 / 0.1.7-rc.2 / 0.2.0-rc.2 上一致存在 → v5 每追加一条 `vibe5/*`，就把**用户自己的会话**变成"写入时无声、
下次恢复时打不开"。修复：v5 只用加固 JSON（`State/<研究所>.v5state.json`），彻底不碰会话日志，并去掉
`sessions` / `sessionProjections` 依赖；连它写进项目的镜像 Markdown 与**给模型看的工具描述**都一并改正。

### G-5 工具过滤里的未注册名让整次派生失败（v4/v5）

`tools.restrict()` 对不在宿主可限制集合里的名字**直接抛错**，而该调用发生在建立子代理时 → v4/v5 一次配置错误
就让每次派生失败（v2/v3 早就有"按宿主提示剔除名字并重试"的守卫）。修复：v4/v5 采用同样的守卫，
并把返回值改成"按宿主提示剔除后重试一次"，且**fail-closed**（绝不在过滤全被剔除时"不过滤"启动）。

### G-6 宿主新增"每根代理 8 个存活 continuable 子代理"上限

0.2.0 新增 `ActivationPool`（`maxActiveSubagents` 默认 8，来自 `subagent` 行的 config，未写入 `.d.ts`），
超出时抛 `SubagentError{code:'ACTIVATION_LIMIT_REACHED'}`；v4 的 `residentCount` 无上限、v5 的临时工上限之和可达 12
→ 撞限。修复：识别该错误码、从宿主消息里记下上限值、明确提示并把该次派生推迟到下一轮（不再让启动循环崩在半途）。

### G-7 压缩：策略调用 vs 执行调用（v4/v5）

`compactIfNeeded(agent,'pressure',signal)` 是**策略**调用，可能什么都不做且返回 `null`（无日志）；真正的执行调用是
`compactNow(agent, signal)`。另外 v5 过去从**插件平面**取 compaction，而 preset 自己 `isolate` 了 compaction realm，
取到的是宿主根实例（配置可能不同）。修复：优先 `compactNow`（特性探测，旧宿主回退到策略调用），v5 改用 agent 自身 ctx 的实例。

### G-8 命令"业务失败"被当成成功

宿主的 `CommandResult` 联合是 `{kind:'success',text?} | {kind:'error',text}`；四套预设的 `/vibe`、`/v4`、`/v5`
在**所有失败路径**上都返回 `{kind:'success', text:'{"ok":false,…}'}` → UI 永远显示不出"这条命令被拒绝了"。

**更正（据实收窄）：这条修复不是一次"全仓"修复，而是分两批落地的，本节初稿把"打算做的"写成了"已经做完的"。**

- **2.4.0（`cc0c220`）只改了 v2 与 v3**（`vibe-math-v2.js` / `vibe-math-v3.js` 的命令 handler）。当时 v4 与 v5 的
  handler 仍然无条件 `return {kind:'success', text:JSON.stringify(r,null,2)}`（各自的"无 session"分支也返回
  `kind:'success'`）——所以"四套都修了"在 2.4.0 这个提交上是不成立的。
- **v4 与 v5 在 round-A（`8ec5a9c`）才各自补上同一形状**：v4 的命令 handler 改成
  `const failed = !r || r.ok === false || (r.ok === undefined && !!r.error)` → `{kind: failed?'error':'success'}`；
  v5 改成 `const failed = r !== null && typeof r === 'object' && r.ok === false` → 同样三元返回，并把"无 session"
  分支一并改成 `kind:'error'`。判据：`git log -G "kind:\s*'error'" -- vibe-math-v4/vibe-math-v4.js`（及 v5 同）
  **只命中 `8ec5a9c`**；round-C（`4eb3175`）与 round-D（`0dc6ee3`）都没有再碰这两个 handler（前者的 v4 hunk 在
  1354/1854 行，后者的 v5 hunk 止于 4564 行，均在命令 handler 之外）。
- **仓库内的回归证据是 round-C（`4eb3175`）补进来的**：`tests/host-failure-paths.test.mjs` 在该提交首次入库，
  它断言 `/v4 set` 未知键、`/v4` 未知子命令与 `/v5` 未知子命令都返回 `kind:'error'`。round-D（`0dc6ee3`）只是
  把"本节仍把 `/v4` 的修复说成全仓，需据实收窄"记进了待办，没有改代码。
- 该联合在 0.1.5 上同样存在，故旧线安全。也就是说：**"四套最终一致"成立，"四套一次修完"不成立**。

### G-9 文档、镜像与工具描述与实现不符

v5 的 README、`架构图.md`、`实现方案.md`、它写进用户项目的三个镜像文件头（`Institutes.md`、`Shared/TaskBoard.md`、
`State/README.md`）以及 `vibe_v5_set` 的**工具描述**都写着"权威状态在会话日志投影里"。修复：全部改为真实位置
（`State/<研究所>.v5state.json`），并重生成 v5 中英架构图。**这一条是提示词/交互面的事实性修复**，不是文风问题。

### G-10 "旧线不读目录"必须用**能力**判定，不能用版本号

`agentPresets` 服务在两条线上**都存在**但语义不同（旧线是目录扫描器、**没有** `register`）——用"服务存在"判形态
会在 0.1.5/0.1.6 上误判为"组合行"，从而**跳过**唯一有效的目录安装。修复：判定读 **loader 入口树**里是否挂了
`@deepseek-ai/dsh-agent-preset`（或其 registry）；这在任何插件激活之前就可见，而"读服务"在 bundle 被单独激活
（`dsh plugin add`）时可能尚未就绪。

---

## 2. 四宿主实测矩阵

| 宿主 | preset 形态 | 实测结果 |
|---|---|---|
| 0.1.5-rc.2 | 目录 | 安装器写入四个目录；声明行静默无副作用；`agentPresets.list()` 列出四个预设 ✅ |
| 0.1.6-alpha.2 | 目录 | 同上 ✅ |
| 0.1.7-rc.2 | 组合行 | 声明行注册四个预设（order 20–23）；安装器跳过目录（`state` 文件不再被写）✅ |
| 0.2.0-rc.2 | 组合行 | 同上，且**零激活警告**（此前数组 patch / 宿主包名 / `!!js` 门各会产生一批失败行）✅ |

---

## 3. 已确证**正确**的部分（避免下次重复劳动）

- `tools.register` 的形状（`name`/`description`/`parameters` + **必需的** `output:{schema,render}` + `execute`）与
  `parameters` 用原生 JSON Schema 的写法（宿主自己的工具也这么写）；handler 返回符合 `output.schema` 的 JSON 字符串 ✓。
- `commands.register`（`name`/`description`/`input:{hint}`/`handler`）与命令名正则 ✓。
- `tools.restrict` 的 `{allow,deny}` 形状，以及"未注册名"错误消息仍以 `known global tools: …` 结尾 —— v2/v3 的重试正则
  逐字符匹配，行为保持 fail-closed ✓。
- `fs`（resolve/stat/readText/writeText/listDir）、`getPolicy()` 作为 `writeText` 第 5 参数的位置 ✓；`FsDirEntry` 字段无改名 ✓。
- `subagents.startContinuable` / `sendMessage`（4 参数 + `{signal}`）/ `interrupt`（第二参数为 authority，自 0.1.1 起）/
  `drainContinuableChildren` 的调用形状自 0.1.2-rc.1 起未变 ✓；`agents.get` 在 `subagent/start` 里可解析、在 `subagent/end`
  里**必然不可解析**——v4/v5 "在 start 时捕获 Agent 引用"的写法继续正确 ✓。
- `subprocess`（spawn/done/terminate/collected）与 `sandboxPolicy.resolve` ✓；`timer` 服务签名与 disposer 语义 ✓。
- `sessionProjections.register/stateOf` 的形状本身 ✓（本包不再使用，原因见 G-4）。

---

## 4. 修复实施记录（2.4.0）

见 `docs/release-notes/RELEASE-NOTES-2.4.0.md`「变更」。工程证据（逐条审计报告与探针输出）保存在仓库之外的
工作区台账中；本文件只保留结论与判据。

新增守卫：`tests/audit-preset-rows.test.mjs`（生成物与生成器逐字节一致、`dsh.bundle.patch` 必须是字符串、
声明行不得命名宿主包、不得使用会调用服务的 `!!js` 门、每条组合必须含 `present`/`command-goal`/`isolate`/`workflow-ptc`、
冻结的 0.1.x 组合保持原样）；`docs/AUDIT-CHECKLIST.md` 新增 §8 把上述四条硬约束写成流程。

---

## 5. 刻意不改（附理由）

| 项 | 决定 | 理由 |
|---|---|---|
| v2/v3 使用全局 `setInterval`/`setTimeout` | 保留 | 预设是**文件行**，不经动态包 vm 沙箱（沙箱只包动态包宿主半）；实测可用，且 `ctx.effect` 内已正确清理。仅修掉"插件运行时没有全局定时器"这句**错误注释**。 |
| 工具卡片呈现（`presentCall`/`presentResult`） | 不加 | 纯外观增强，与本次适配无关；未来要加需同步四套。 |
| `subagents.listChildren` 元素类型变化（`SubagentCatalogEntry`） | 不处理 | 四套预设均未调用。 |
| `additionalProperties:false` 的 `parameters` | 保留 | 宿主 `tools.register` 不校验 `parameters`；仅当预设改造成**动态包**时 `defineTool` 才会拒绝（届时再改）。 |
| `followup` 回退分支 | 保留 | 该分支只在 0.1.1 及更早存在；本包声明的下限是 0.1.2-alpha.4，其中 `0.1.2-alpha.*` 是否仍带 `followup` 未实测，保留分支零成本且更稳。 |
