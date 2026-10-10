# 18 · 命令与协议参考（工具 / 服务 / 钩子 / 协议 / 权限矩阵 / 错误码速查）

> 状态：**草案 v0.1**（新卷；task-44 起草 ✓；**已实现面以 `host.js` 的 `TOOL_NAMES` 与各模块导出为准** ✓，计划面一律带标记 ✓；与 `03` 的一致性核对见 §11 ✓）
> 上位：`03-interface-contract.md`（服务/工具/钩子/码的唯一登记表 ✓）、`05-middleware.md`（钩子全景与能力面 ✓）、`11-gates-and-development.md`（接缝与门禁纪律 ✓）、`04-settings.md`（参数登记 ✓）、`02-architecture.md`（分区与公开面 ✓）

> **定位**：本卷是**代理可执行面的唯一权威参考** —— "我能调用什么、怎么调、会得到什么、错了怎么办"一眼可查。
> **唯一准绳（硬约束）**：**已实现工具面以 `host.js` 的 `TOOL_NAMES` 与各处理分支为准**（本卷逐条抄自代码，不凭记忆）；**服务面以 `03-§2` 为准**；**错误码以 `03-§8` 为唯一登记表**（本卷第 7 节只是**人读视图**，不新增、不改名）。
> **成熟度图例**：✓ 已实现（可调用）｜✗ 计划（**本卷所有 ✗ 名称都写在含"计划/未实现"标记词的行上**）｜⚠ 已实现但有已知缺陷（附规避）
> **版本**：`host.js` / `host-hooks.js` / `kernel/bus.js` / `kernel/prompt/index.js` / `kernel/script-bridge.js` 均导出 `apiVersion = 1`。

---

## 0. 读法（30 秒）

1. **要调用**：看 §1（有哪些工具、什么条件下出现）→ §2（该工具的 action/参数/返回）。
2. **要写扩展**：看 §3（计划工具）→ §5（钩子）→ §6（协议与 M3 脚本）。
3. **被拒了**：看 §7（码 → 处置）→ §8（权限矩阵，判断"是不是我权限不够"）。
4. **不确定**：看 §9（未核项，指向 `14-§2`）。
5. **要验收**：看 §10（机器可判定判据）。

**两条元规则**
- **零机制**：`vmu.core.enabled === false` ⇒ **一个工具都不注册**（inert 即不可见）；enabled 但什么都没声明 ⇒ **恰好一个工具 `vibe_vmu_status`**（"能看见自己是惰性的"就是默认的意义）。
- **按实际存在过滤**：工具只在它暴露的东西存在时出现（例：没有耐久根 ⇒ 没有 `vibe_vmu_records`）。

---

## 1. 工具总表（9 个 `vibe_vmu_*` ＋ 1 个继承工具）

| 工具（`TOOL_NAMES` 键） | 出现条件 | 权限面 | 幂等性 | 主要 action |
|---|---|---|---|---|
| `vibe_vmu_status`（`status`） | **内核启用即恒有** | 只读 | ✓ | （无 action；纯读） |
| `vibe_vmu_set`（`set`） | 提供 `assertDeclared`（键登记表）时 | 设置写；**H3 键具名拒** | ✗（写；重复同值＝无害但非幂等语义） | （无 action；`key`/`value`） |
| `vibe_vmu_middleware`（`middleware`） | **有已声明条目 或 总线已有条目** | 机制管理 | `list/validate/dryRun` ✓ 只读；`disable/enable` ✗ | `list`(默认)`/disable/enable/validate/dryRun` |
| `vibe_vmu_records`（`records`） | `kernel.library` 存在（有 `root`） | 记录读写 | `list/expand` ✓；`append` ✗（内容指纹去重） | `list`(默认)`/expand/append` |
| `vibe_vmu_script`（`script`） | 本次运行**声明了脚本** | 执行 M3 脚本 | `list` ✓；`run` ✗ | `list`(默认)`/run` |
| `vibe_vmu_pack`（`pack`） | 传入 `packLoader` | 包装载 | `list/plan` ✓；`apply/unload` ✗ | `list`(默认)`/plan/apply/unload` |
| `vibe_vmu_control`（`control`） | `controlTool` 为真 | 控制面 | `status` ✓；`pause/resume/stop/beat` ✗ | `status`(默认)`/pause/resume/stop/beat` |
| `vibe_vmu_meeting`（`meeting`） | `meetingTool` 为真 | 会议/表决原语 | `list` ✓；写动作 ✗ | `list/open/speak/silent/close/ballot/vote/tally/reopen` |
| `vibe_vmu_task`（`task`） | `taskTool` 为真 | 任务台账 | `list/stage/brief/history` ✓；写动作 ✗ | `list/create/assign/transition/stage/advance/brief/history` |
| `math_computation` | **声明了数学意图**（`vibe-math-vmu.js:149`） | 计算面 | `probe/receipt` ✓；`run/install` ✗ | 由共享模块登记：`op=probe|run|receipt|install` |

**注册面硬纪律（`host.js` 逐条）**
- 宿主形状＝`{ name, description, parameters, output:{schema:{type:'string'}, render}, execute }`；`execute` 返回 **JSON 字符串**，`render` 返回**内容块数组**（写错键会被宿主**静默忽略** ⇒ 工具永不出现）。
- 参数 schema 一律 `{ type:'object', properties, additionalProperties:false, required[] }`（**非 object schema 会被 provider 拒绝整个请求**）。
- 注册走 `ctx.effect(..., 'vmu:tool:<name>')`（宿主负责卸载）；**同名已注册则跳过**（幂等）；单个注册失败**记入 `failures` 且不影响其它**。
- `plan()` 纯函数给出"将会注册哪些名字"（零机制的宿主侧证明）；`uninstall()` 视 `ownedByHost` 决定是否由宿主回收。

---

## 2. 逐工具参考（可照抄）

### 2.1 `vibe_vmu_status` ✓
- **参数**：无（`parameters: {}`）。
- **返回**：`{ ok:true, instance, ...kernel.status() }`（含：启用了哪些**服务/接缝**、**总线条目**、生效**整合包**、**实例身份**、是否"零机制惰性"、`settings.resolved`（每键的值/来源/热类））。
- **错误码**：`VMU_MIDDLEWARE_FAILED`（`status()` 自身异常时具名回执）。
- **幂等**：✓ 纯读。**前置**：无（这是"内核惰性"的唯一观测面）。
- **可照抄**：`{"name":"vibe_vmu_status","arguments":{}}`
- **反模式**：✗ 用 `status` 猜别的工具存在与否 —— 应以返回的 `services`/`busEntries` 为准；✗ 把它当写入口。

### 2.2 `vibe_vmu_set` ✓
- **参数**：`key`（string，**必填**，必须已在 `04-§11` 登记）｜`value`（string；按声明类型解析：`boolean`／`natural`／`positiveInteger`／`stringList`／`objectList`（后两类要求 **JSON**）／字符串）。
- **返回**：`{ ok:true, key, value(parsed), hot, who, appliesFrom, source, note }`；`appliesFrom` 逐字映射：`H0 → immediately`｜`H1 → next turn`｜`H2 → next session (restart required)`。
- **错误码**：`VMU_INVALID_ARGUMENT`（未声明键／`value` 非合法 JSON）｜**`VMU_NOT_PERMITTED`（H3 只读键，框架所有）**｜`VMU_PACK_CONFLICT`（底层写入拒绝）。
- **幂等**：✗（写操作）。**前置**：键必须登记；H0 立即生效、H1 下一回合、H2 下一会话。
- **可照抄**：`{"name":"vibe_vmu_set","arguments":{"key":"vmu.core.enabled","value":"true"}}`
- **反模式**：✗ 给未登记键传值（一定被拒）｜✗ 以为改 H2 键"立刻生效"（回执会明说需要重启）｜✗ 对 H3 键重试（永远拒）。

### 2.3 `vibe_vmu_middleware` ✓
- **参数**：`action`（enum：`list`(默认)`|disable|enable|validate|dryRun`，**必填**）｜`id`（disable/enable 必填；dryRun 可改用 `rule`）｜`rule`（M1 规则的 **JSON 文本**）｜`samples`（dryRun 的事件样本 **JSON 数组**）。
- **返回**：`list` ⇒ 总线 `status()`（含 `dryRun`/`hookTimeoutMs`/`breakerThreshold`/`entries[]`（`hits`/`consecutiveFailures`/`disabledReason`）/`hooks[]`）｜`disable|enable` ⇒ `{ok,action,result}`｜`validate` ⇒ `{ok,action,problems[],vocabulary}`｜`dryRun` ⇒ `{ok,action,...规则引擎的"将会发生什么"}（**无副作用**）`。
- **错误码**：`VMU_INVALID_ARGUMENT`（未知 action／缺 `id`／`rule`/`samples` 非 JSON／未给 rule 或 id）｜`VMU_NO_SUCH_OBJECT`（`id` 不存在，附已声明 id 列表）。
- **幂等**：`list/validate/dryRun` ✓；`disable/enable` 对同 id 重复调用是**收敛的**（结果相同）。
- **可照抄**：`{"name":"vibe_vmu_middleware","arguments":{"action":"list"}}`／`{"action":"dryRun","rule":"{\"on\":\"ballot/cast\",\"capabilities\":[\"deny\"]}","samples":"[{\"hook\":\"ballot/cast\"}]"}`
- **反模式**：✗ 把 `rule` 传成对象（必须 JSON **字符串**）｜✗ 用 `dryRun` 期望"真的跑一次"（它**只报告**）｜✗ 用 `disable` 当作卸载（总线上有 `remove` 才算卸载；`disable` 只是停用）。

### 2.4 `vibe_vmu_records` ✓
- **参数**：`action`（enum：`list`(默认)`|expand|append`）｜`id`（expand 必填）｜`kind`（append：`proposition|method|subproblem`）｜`statement`（append）｜`proof`（append：证明/方法正文）。
- **返回**：`list` ⇒ `{records:[…]}`（**不含正文**）｜`expand` ⇒ 记录正文（**超限计数**：截断数字可见）｜`append` ⇒ `{ok,id,fingerprint,deduplicated,...}`（**按内容指纹去重**）。
- **错误码**：`VMU_INVALID_ARGUMENT`（action 非法/缺参）｜`VMU_NO_SUCH_OBJECT`（expand 悬空 id）｜`VMU_WRITE_FAILED`（落盘失败）｜`VMU_BODY_TRUNCATED`（正文被计数式截断返回）。
- **幂等**：`list/expand` ✓；`append` **内容幂等**（同内容 ⇒ `deduplicated:true`）。
- **可照抄**：`{"action":"append","kind":"proposition","statement":"设 n>2…","proof":"最小反例归约…"}`
- **反模式**：✗ 用 `list` 期待正文（正文只在 `expand`）｜✗ 靠"再 append 一次"更新记录（应用新指纹/新 id，历史不覆盖）。

### 2.5 `vibe_vmu_script` ✓
- **参数**：`action`（`list`(默认)`|run`）｜`id`（run 必填）｜`args`（**JSON 字符串数组**，附加参数）。
- **返回**：`list` ⇒ `{scripts:[{id,file,timeoutMs}]}`｜`run` ⇒ `{ok:true,action,script:id,ran,exit,policy,ok,summary,findings[],data}`（脚本必须打印 **JSON**，且含布尔 `ok`）。
- **错误码**：`VMU_NO_SUCH_OBJECT`（脚本 id 未声明，附已声明列表）｜`VMU_INVALID_ARGUMENT`（action 非法／`args` 非 JSON 数组／**脚本输出非 JSON 或缺 `ok`**）｜`VMU_JOB_TIMEOUT`（超时，**硬失败**）｜`VMU_MIDDLEWARE_FAILED`（起进程失败；`abort` 策略下附 `aborted:true`；错误上带 `hostStack`/`shape` 诊断）｜`VMU_ENGINE_UNAVAILABLE`（未注入 subprocess 接缝）。
- **幂等**：`list` ✓；`run` ✗（脚本可能有副作用；**桥不重试**）。
- **前置**：脚本必须在配置里声明（`id`/`file`；可选 `args`/`cwd`/`env`/`timeoutMs`/`failure`）。
- **可照抄**：`{"action":"run","id":"check-units","args":"[\"--strict\"]"}`
- **反模式**：✗ 让脚本打印自由文本（会被具名拒：**必须结构化**）｜✗ 把脚本结果当提示词（**M3 结果永不自动进入提示词**）｜✗ 依赖 `cwd` 缺省（见 §6.4 宿主缺陷）。

### 2.6 `vibe_vmu_pack` ✓
- **参数**：`action`（`list`(默认)`|plan|apply|unload`）｜`id`（unload 必填；也可给随包 id）｜`manifest`（**内联 manifest 的 JSON 文本**）。
- **返回**：`list` ⇒ 装载器状态｜`plan` ⇒ **纯**报告"将会改什么"｜`apply` ⇒ 应用结果（**冲突即具名拒**）｜`unload` ⇒ 逐个回滚结果。
- **错误码**：`VMU_INVALID_ARGUMENT`（未知 action／manifest 非 JSON／缺 manifest／缺 id）｜`VMU_PACK_CONFLICT`（冲突）｜`VMU_PACK_MISSING`（包缺失）｜`VMU_ENGINE_UNAVAILABLE`（无装载器）｜`VMU_PACK_KERNEL_OVERRIDE_REFUSED`（试图覆盖内核强制面）。
- **幂等**：`list/plan` ✓；`apply` ✗（应收敛：重复 apply 同 manifest 应被冲突/去重机制挡住，**不要**靠它做重试）。
- **可照抄**：`{"action":"plan","manifest":"{\"id\":\"demo\",\"entries\":[]}"}`
- **反模式**：✗ 用 `apply` 代替 `plan` 试探（先 `plan`）｜✗ 以为 `unload` 能撤销"用户自己的段"（它只回滚**应用过的**包内内容）。

### 2.7 `vibe_vmu_control` ✓
- **参数**：`action`（`status`(默认)`|pause|resume|stop|beat`）｜`reason`（pause/stop 原因，写入控制面与审计）｜`note`（beat 备注）。
- **返回**：`status` ⇒ `kernel.control()`｜`pause` ⇒ `{ok,state:'paused',reason,at,middleware}`｜`resume` ⇒ `{ok,state:'running',resumedFrom,middleware}`｜`stop` ⇒ `{ok,stopped:true,state:'stopped',reason,middleware}`｜`beat` ⇒ 心跳回执（供 `wallClockMs` 判 stale）。
- **错误码**：`VMU_STATE`（如"已停止的内核不能暂停"／"未暂停不能恢复"）｜`VMU_INVALID_ARGUMENT`（未知 action）。
- **幂等**：`status`/`beat` ✓；`pause/resume/stop` 状态机化（重复 pause 在 paused 态是允许的；**resume 在非 paused 态会被具名拒**）。
- **语义（重要）**：**暂停是真门禁** —— 暂停期间**任务变更会被具名拒**，且总线收到 `control/paused`（中间件可反应）。
- **可照抄**：`{"action":"pause","reason":"等待用户裁定"}`／`{"action":"beat","note":"worker alive"}`
- **反模式**：✗ 把 `beat` 当"续期预算"（它只是观测）｜✗ 用 `stop` 当"重启"（stop 后**不能** resume，需重新启动）。

### 2.8 `vibe_vmu_meeting` ✓
- **参数**：`action`（enum：`list|open|speak|silent|close|ballot|vote|tally|reopen`）｜`id`（会议 id；speak/silent/close 必填，open 可指定）｜`ballotId`（vote/tally/reopen 必填）｜`member`（speak/silent/vote 必填）｜`text`（speak 必填）｜`reason`（silent/close/reopen）｜`agenda`（open）｜`roster`（array；open）｜`target`（ballot 必填）｜`value`（vote 必填）｜`kind`（vote：`decisive`(默认)`|advisory`）。
- **返回**：`list` ⇒ `kernel.liveList()`（live 会议/表决）｜`open` ⇒ `{ok,action,id,state}`｜`speak/silent/close` ⇒ 原语回执｜`ballot` ⇒ `{ok,action,ballotId,opened,target}`｜`vote` ⇒ 原语 `cast()` 回执｜`tally` ⇒ `close('tally')` 结果｜`reopen` ⇒ `{reopened:…}`（原语不支持时返回 `reopened:false`）。
- **票值归一化（体贴模型的实现细节）**：`1/0` 直传；`"1"|"true"|"for"|"yes"|"赞成"|"同意"` ⇒ `1`；`"0"|"false"|"against"|"no"|"反对"` ⇒ `0`；**其它原样透传**（让原语给出权威拒绝）。
- **错误码**：`VMU_NO_SUCH_OBJECT`（live 会议/表决 id 不存在，附 `use action=list`）｜`VMU_INVALID_ARGUMENT`（缺必填参数／未知 action）｜`VMU_STATE`（原语状态不允许，如重复开/关）｜`VMU_MEETING_TOO_SMALL`（参与人数不足门槛）。
- **幂等**：`list` ✓；`open/ballot` ✗（每次生成新 id）；`vote` ✗；`tally` ✗（会闭合并计票）；`reopen` ✗。
- **可照抄**：
  `{"action":"open","agenda":"议题：n=3 的归约","roster":["acad","r-1"]}`
  `{"action":"vote","ballotId":"b-1","member":"r-1","value":"赞成"}`
  **通用纪律：先 `list` 拿 live id，再寻址。**
- **反模式**：✗ 猜会议/表决 id（一律先 `list`）｜✗ 把 `advisory` 票当决定票（`kind` 语义由原语与政策定）｜✗ 用 `speak` 表达票（**票只由 `vote` 产生**）。

### 2.9 `vibe_vmu_task` ✓
- **参数**：`action`（enum：`list|create|assign|transition|stage|advance|brief|history`）｜`id`（assign/transition/brief 必填）｜`title`（create 必填）｜`objective`｜`owner`（create/assign）｜`deps`（array）｜`to`（transition/advance）｜`reason`。
- **返回**：`list` ⇒ `{tasks:[…]}`｜`create` ⇒ `{ok,id,state}`｜`assign/transition/advance` ⇒ 原语回执｜`stage` ⇒ 当前阶段视图｜`brief` ⇒ 单任务简报｜`history` ⇒ `{history:[…]}`（可给 `id` 过滤）。
- **错误码**：`VMU_INVALID_ARGUMENT`（缺必填/未知 action）｜`VMU_NO_SUCH_OBJECT`（任务 id 不存在）｜`VMU_STATE`（非法迁移／**暂停期间的任务变更被具名拒**）｜`VMU_RESOURCE_BUDGET`（人数/任务容量上限）。
- **幂等**：`list/stage/brief/history` ✓；`create` ✗；`assign/transition/advance` ✗（状态机，重复同迁移通常被状态拒）。
- **可照抄**：`{"action":"create","title":"核验 n=3 情形","owner":"r-2","deps":[]}`／`{"action":"transition","id":"t-1","to":"done","reason":"验收通过"}`
- **反模式**：✗ 依赖 `deps` 未满足就 `transition`（会被状态拒）｜✗ 把任务当"消息"用（任务有依赖/阶段门，内核强制）。

### 2.10 `math_computation` ✓（继承工具）
- **出现条件**：**声明了数学意图**；由共享模块登记。
- **op**：`probe`（探测引擎/可用性）｜`run`（执行）｜`receipt`（取回执）｜`install`（装依赖，**须走安装范围**）。
- **返回**：结构化回执（`ok`、引擎、argv、退出码、产物路径/哈希、`preset` 标识）；失败码见 §7（`VMU_MATH_*`/`VMU_ENGINE_UNAVAILABLE`/`VMU_JOB_TIMEOUT`）。
- **幂等**：`probe/receipt` ✓；`run/install` ✗（`run` 有内容寻址去重）。
- **反模式**：✗ 期望"没有引擎也能算"（会 `VMU_ENGINE_UNAVAILABLE`）｜✗ 把 `install` 当无副作用操作。

---

## 3. 计划工具面 ✗（**未实现；名称即"计划"**）

> 以下均为**计划中的工具（尚未实现）**；每个给目标形状草案、依赖子系统、优先级。**正文中的 ✗ 名称都在这类标记行内。**

| 计划工具（未实现 ✗） | 目标 action（草案） | 依赖子系统 | 优先级 |
|---|---|---|---|
| `vibe_vmu_agenda`（计划） | `get`/`set`/`add`/`drop` | 会议原语 + `03-§2` 服务面扩展 | P1 |
| `vibe_vmu_motion`（计划） | `propose`/`second`/`withdraw`/`vote` | 动议原语（GAPS K3/K5） | P1 |
| `vibe_vmu_minutes`（计划） | `draft`/`confirm`/`append`/`export` | 记录面 + 决议实体 | P1 |
| `vibe_vmu_board`（计划） | `list`/`move`/`wip`（看板视图） | `vmu.tasks` | P2 |
| `vibe_vmu_workflow`（计划） | `start`/`step`/`settle` | `vmu.work` + 脚本桥 | P1 |
| `vibe_vmu_budget`（计划） | `get`/`set`/`status` | 预算分散在 members/tasks 的容量检查（`03-§2②`） | P2 |
| `vibe_vmu_scheduler`（计划） | `plan`/`tick`/`status` | 控制面 + 定时接缝 | P2 |
| `vibe_vmu_metrics`（计划） | `snapshot`/`series` | 观测面扩展 | P2 |
| `vibe_vmu_audit`（计划） | `tail`/`query`/`verify` | 审计落盘（`VMU_AUDIT_WRITE_FAILED` 面） | P1 |
| `vibe_vmu_math`（计划） | `probe`/`run`/`receipt`（**与 `math_computation` 的关系待裁决**） | 数学面 | P2 |
| `vibe_vmu_formal`（计划） | `submit`/`status`/`verify` | `kernel/lean.js` 形式化面 | P1 |
| `vibe_vmu_units`（计划） | `check`/`convert` | 数学/量纲面（`VMU_MATH_DIMENSION_MISMATCH`） | P2 |
| `vibe_vmu_prompts_preview`（计划） | 干跑：给解析计划与差异 | 提示词管线 + **钩子名修复**（§5.4） | P1 |
| `vibe_vmu_prompts_snapshot`（计划） | 快照与逐字对比 | `snapshot(scopes)` | P1 |
| `vibe_vmu_middleware_status`（计划） | 机制自证（条目/熔断/追踪） | 总线 `status()`/`trace()` | P2 |

---

## 4. 服务面（**与 `03-§2` 一致；本卷只做调用视角速查**）

**① 真正发布的服务（`registry.register`；共 8 个 ✓，与 `03-§2` 逐项一致）**

| 服务键 | 出现条件 | 用途速记 | apiVersion |
|---|---|---|---|
| `vmu.library` | 有 `root` | 归档与记忆（append/list/expand/指纹） | 1 |
| `vmu.members` | 恒（启用时） | 成员与角色槽位（roles/roster/hire/assignRole/end/wake） | 1 |
| `vmu.tasks` | 恒 | 任务与阶段（create/assign/transition/stage/advance…） | 1 |
| `vmu.prompt` | 恒 | 提示词管线（register/assemble/override/rollback/snapshot/bindToHost） | 1 |
| `vmu.middleware` | 恒 | 中间件总线（status/entries/disable/enable/setDryRun/validateEntry） | 1 |
| `vmu.store` | 有 `root` | 耐久端口（open/read/write/patch/migrate/import/stats） | 1 |
| `vmu.work` | 有 `root` | 在途工作台账（start/settle/interrupt/recover…） | 1 |
| `math_computation` | 声明数学意图 | 继承的数学工具面（`op=probe|run|receipt|install`） | 1 |

**② 未发布（**不是服务** ✗，勿在 pack 里 `require`）**：`kernel.bus`/`rules`/`loader`/`bridge`/`registry`（**只读句柄**）｜`kernel.meeting(opts)`/`ballot(opts)`（**逐对象工厂**，`vmu.meetings` 服务**不存在**）｜`kernel.control()/pause/resume/stop/beat`（控制面，经工具可及）｜设置原语（`setSettingsValue`/`settingsSnapshot`/`settingDef`…；`vmu.settings` 服务**不存在**）｜`createPackLoader`（工厂；`vmu.packs` 服务**不存在**）｜预算（分散在容量检查里；`vmu.budget` **不存在**）。

**③ 一致性核对结论（本卷 vs `03-§2`）**：**未发现不一致** ✓ —— 8 个服务键、条件（`root`/数学意图）、未发布项（句柄/工厂/控制面/设置原语/装载器/预算）与 `03-§2` ①②**逐条对应**。**唯一需登记的表层差异**：本卷把 `math_computation` 记为"工具＋服务双面"（它既在 `TOOL_NAMES` 之外的继承工具，也在服务面），`03-§2` 只列服务面 ⇒ **不是冲突**，但建议 `03` 补一句"同时是继承工具"（见 §11-③）。

---

## 5. 钩子面

### 5.1 20 个冻结钩子（`VU_HOOKS` 逐字）＋默认失败策略＋生产者
| # | 钩子 | 默认失败 | 生产者 | 可拒绝 | 可改写 | 典型决策键 |
|---|---|---|---|---|---|---|
| 1 | `member/wake-before` | `closed` | ✓ `members.js` | ✓ | ✓ | `deny`/`rewriteArgs`/`appendPrompt` |
| 2 | `member/wake-after` | `closed` | ✓ `members.js` | ✗ | ✗ | `record`/`notify`/`annotate` |
| 3 | `turn/reply-parsed` | `closed` | **✗ 无生产者** | ✓ | ✓ | `deny`/`rewriteResult` |
| 4 | `meeting/round-start` | `closed` | ✓ `meeting.js` | ✓ | ✓ | `deny`/`rewriteArgs` |
| 5 | `meeting/round-end` | `closed` | ✓ `meeting.js` | ✗ | ✗ | `record`/`notify` |
| 6 | `ballot/cast` | `closed` | ✓ `ballot.js` | ✓ | ✗ | `deny`（唯一） |
| 7 | `ballot/tally` | `closed` | ✓ `ballot.js`＋`packs/v3-core.js` | ✓ | ✗ | `deny`/`annotate` |
| 8 | `record/append-before` | `closed` | **✗ 无生产者** | ✓ | ✓ | `deny`/`rewriteArgs`/`record` |
| 9 | `record/appended` | **`open`** | **✗ 无生产者** | ✗ | ✗ | `record`/`annotate` |
| 10 | `task/assign` | `closed` | ✓ `members.js`/`tasks.js` | ✓ | ✓ | `deny`/`rewriteArgs` |
| 11 | `task/transition` | `closed` | ✓ `tasks.js` | ✓ | ✗ | `deny`/`record` |
| 12 | `prompt/section-assembled` | **`open`** | **✓ 已有生产者**（装配路径 emit ✓；曾漂移为 `prompt/assemble` ✗，本会话已修 ✓，见 §5.4） | ✓ | ✓ | `deny`/`appendPrompt`/`rewriteResult` |
| 13 | `budget/exceeded` | **`abort`** | **✗ 无生产者** | ✓ | ✗ | `deny`/`annotate` |
| 14 | `pack/loading` | `closed` | **✗ 无生产者** | ✓ | ✓ | `deny`/`rewriteArgs` |
| 15 | `pack/loaded` | `closed` | **✗ 无生产者** | ✗ | ✗ | `record`/`notify` |
| 16 | `settle/before` | `closed` | ✓ `tasks.js` | ✓ | ✗ | `deny`（唯一） |
| 17 | `settle/after` | `closed` | ✓ `tasks.js` | ✗ | ✗ | `record`/`annotate`/`notify` |
| 18 | `control/paused` | **`open`** | ✓ `kernel/index.js` | ✗ | ✗ | `notify`/`annotate` |
| 19 | `control/resumed` | **`open`** | ✓ `kernel/index.js` | ✗ | ✗ | `notify`/`annotate` |
| 20 | `control/heartbeat` | **`open`** | ✓ `kernel/index.js` | ✗ | ✗ | `record`/`notify`/`annotate` |

**统一信封**：`emit(hook, payload, {member, role, phase, traceId})`；条目处理器收到 `{hook, payload, ctx, dryRun, traceId, setting(k)}`；**返回 `undefined/null` ＝ 放行**；返回决策对象 ⇒ 逐键校验声明的**能力**（12 项：`read-state`/`read-args`/`deny`/`cancel`/`rewrite-args`/`rewrite-result`/`append-prompt`/`record`/`notify`/`set-setting`/`trigger-workflow`/`annotate`）；**`deny`/`cancel` 终止**；超时 `vmu.middleware.hookTimeoutMs`（默认 2000）；熔断 `vmu.middleware.breakerThreshold`（默认 3）。

### 5.2 宿主钩子桥（`host-hooks.js`，14 个 `BRIDGED_HOOKS`）
```
tools/pre-execute · tools/post-execute · tools/execute · tools/result
agent/pre-step · agent/turn-stopping · agent/created
subagent/start · subagent/end
session/event · system-prompt/assemble · prompt/assemble · settings/changed · fs/write-intent
```
**映射规则（逐字实现）**
- `tools/pre-execute`：`deny`⇒`{kind:'deny',reason}`｜`cancel`⇒`{kind:'cancel',reason}`｜**`ask`⇒`{kind:'ask'}`**｜**`rewriteArgs`⇒`{kind:'refuse-unsupported', code:'VMU_NOT_PERMITTED'}`（宿主不支持入参改写，**具名拒**而不是静默忽略**）**。
- `tools/post-execute`：`replaceResult`⇒`{kind:'accept',value}`｜`deny|block`⇒`{kind:'block',feedback}`。
- **其它桥接钩子＝观测**：决策被记录，waterfall **总是继续**（`next()`）。
- **零机制**：某宿主钩子上没有已声明条目 ⇒ **不注册监听器**；`plan()` 纯函数给出"将会挂哪些"。
- **框架级预算**：`vmu.limits.toolCallsPerTurnCap > 0` ⇒ **即使没有中间件**也会挂 `tools/pre-execute`＋`agent/turn-stopping`；超限 ⇒ `{kind:'deny', reason:'VMU_RESOURCE_BUDGET: …'}`（回执含已用/上限）。
- **缺事件面**：有计划项但 `ctx.on` 不存在 ⇒ `VMU_ENGINE_UNAVAILABLE`。

### 5.3 钩子→工具的对照（写扩展时最常用）
| 想拦住的事 | 用哪个钩子 | 能做什么 |
|---|---|---|
| 工具调用前拒绝/要求批准 | `tools/pre-execute`（宿主钩子） | `deny`/`cancel`/`ask`（**不能改入参**） |
| 工具结果改写/阻断 | `tools/post-execute` | `replaceResult`／`block` |
| 唤醒前拦人 | `member/wake-before` | `deny`/改摘要/追加提示 |
| 开会/收口 | `meeting/round-start|end` | 拒绝开会；记录收口 |
| 投票面 | `ballot/cast|tally` | **只能拒绝**，不得改票/改计票 |
| 结算面 | `settle/before|after` | **只能拒绝**；事后记录 |
| 提示词 | `prompt/section-assembled`（**见 §5.4 缺陷**） | 拒绝/追加/改写段 |
| 记录 | `record/append-before|appended`（**无生产者**） | 拒绝/改写内容（目标态） |

### 5.4 **已实现但未接线（真实缺口）** ✗
- **`prompt/assemble` ≠ `prompt/section-assembled`**：`kernel/prompt/index.js` 与 `host-hooks.js`/`kernel/loader.js` emit 的是 `prompt/assemble`，**不在冻结集内** ⇒ 总线无人应答 ⇒ **中间件目前无法介入提示词装配**。
- `budget/exceeded`、`pack/loading|loaded`、`record/*`、`turn/reply-parsed`：**有冻结名无生产者** ⇒ 相应介入是**纸面能力**。
- 处置建议：把 emit 改为冻结名（逐段语义），并把截断接到 `budget/exceeded`（详见 `05 §5.2` 与 `06 §17`）。

---

## 6. 协议参考

### 6.1 版本与握手
- `apiVersion = 1`：`host.js`／`host-hooks.js`／`kernel/bus.js`／`kernel/prompt/index.js`／`kernel/script-bridge.js`／`kernel/guard.js` **各自导出**。
- **握手**＝装载期比对：版本不匹配 ⇒ **拒绝装载**（`VMU_VERSION_MISMATCH`，须给**双方版本**），不得"尽力而为"半挂。
- **能力协商**：条目必须先声明 `capabilities` 才能用（见 §5.1）；未声明即用 ⇒ `VMU_MIDDLEWARE_FAILED`（**恒按 closed**＋计熔断）。

### 6.2 总线主题与扩展纪律
- **主题命名**：一条消息＝一个 `hook` 名；**内核钩子名（20 个）与宿主钩子名（14 个桥接）为保留名**。
- **自定义主题**：**必须带命名空间**（推荐 `<packId>/<topic>`）；**不得占用保留名**；未知字段**忽略**（向前兼容）；破坏性变更**升主版本**。
- **未知钩子名的 emit 不会被拒**（总线不校验）——**这是 §5.4 缺陷能静默发生的机制原因**；扩展方**必须**先核对 `VU_HOOKS`/`BRIDGED_HOOKS`。

### 6.3 宿主接缝（`subprocess` / `timer` / `fs`）
- **subprocess**：`host-spawn.js` 把宿主接缝包成 `spawn(request)`；请求形状 `{argv, cwd, stdio:{stdin:'ignore', stdout:{maxBytes}, stderr:{maxBytes}}, graceMs}`；**输出上限各 1 MiB**（`DEFAULT_STDOUT_CAP`/`DEFAULT_STDERR_CAP`）；超时既回报 `timedOut:true` 也把 `graceMs` 交给宿主真正终止进程。
- **timer**：心跳/计时由内核控制面驱动（`control/heartbeat`）；**没有**"用中间件自立调度器"的通道。
- **fs**：耐久经 `kernel/store.js`（原子写）；写入意图可被 `fs/write-intent`（宿主钩子）观察；路径政策 `vmu.safety.pathPolicy` 经 `kernel/guard.js`（`guardWrite`/`guardSpawnCwd`/`describePolicy`；越界 ⇒ `VMU_PATH_ESCAPE_REFUSED`）。
- **跨进程/跨会话（计划 ✗）**：脚本桥是唯一跨进程通道；跨会话协调（会话间总线/主题订阅）**尚未实现**，见 §9。

### 6.4 M3 脚本协议（真实形状 ＋ 宿主缺陷规避）
**请求（`validateRequest` 逐字）**：
| 字段 | 类型 | 约束 |
|---|---|---|
| `file` / `inline` | string | **二选一**（都给 ⇒ 拒；都不给 ⇒ 拒） |
| `args` | string[] | 每项必须是字符串 |
| `timeoutMs` | int ≥ 0 | `0` ⇒ 用桥默认（`defaultTimeoutMs = 60000`） |
| `failure` | `open|closed|abort` | 缺省 `open` |
| `cwd` | string | **给了就必须是 string**（`undefined` 也算"给了"⇒ 拒） |
| `env` | object | 不得是数组 |

**结果（`parseResult` 逐字要求）**：stdout 必须是 **JSON 对象**且含**布尔 `ok`**；被采纳字段：`{ok, summary, findings[], data}`；**空输出/非 JSON/无 `ok` ⇒ `VMU_INVALID_ARGUMENT`**（"以后再去解析自由文本"是管线腐化之源）。
**失败语义**：非零退出＝**结果**（`{ok:false,ran:true,exit,policy,timedOut:false,stderr≤2000B,trace}`；`abort` 策略 ⇒ 抛 `VMU_MIDDLEWARE_FAILED` ＋ `aborted:true`）｜超时＝**硬失败** `VMU_JOB_TIMEOUT`（给 `timeoutMs` 与"可恢复"提示）｜起进程失败 ⇒ `VMU_MIDDLEWARE_FAILED`（带 `hostStack`/`shape` 诊断，**必须原样透传到工具面**）。**无 subprocess 接缝 ⇒ `VMU_ENGINE_UNAVAILABLE`**。
**dry-run**：`dryRun` 时**不执行**，返回 `{ok:true,dryRun:true,ran:false,plan:{argv,cwd,timeoutMs,env:排序后的键}}`。
**⚠ 已知宿主缺陷（调用侧规避 ✓）**：不给 `cwd`（或给 `undefined`）时，宿主 `dsh-subprocess-local` 的 **`validateNoNullByte`**（`runner-launch-*.js:1509` ← `targetEnvironment:1520`）会抛 `Cannot read properties of undefined (reading 'includes')` —— **连"省略 cwd 键"也会崩**。
- **规避（实现已做）**：`host-spawn.js` **总是传一个真实字符串 cwd**（调用方 `cwd` → 配置的 workspace → `process.cwd()`）；工具面**条件构造**请求（`cwd` 不是非空字符串就**不带该键**）；`env` **只保留字符串**（数字/布尔转字符串，其它丢弃）。
- **证据链**：`tests/vmu-spawn.test.mjs` 注释＋`11-§M3 解除过程`＋`12-§7（已知宿主缺陷·调用侧规避）`＋`14-§2 F3`。**未核**：宿主未来是否修掉该行为（见 §9）。

### 6.5 降级与失败（跨面汇总）
| 情形 | 行为 | 码 |
|---|---|---|
| 宿主无 `tools.register` | 拒绝安装 | `VMU_ENGINE_UNAVAILABLE` |
| 单个工具注册失败 | 记入 `failures`，其余照常 | 原样码（多为 `VMU_MIDDLEWARE_FAILED`） |
| 宿主钩子缺 `ctx.on` 且有计划项 | 拒绝桥接 | `VMU_ENGINE_UNAVAILABLE` |
| 中间件失败（钩子） | 按条目失败策略：`open` 放行／`closed` 拒／`abort` 中止 | `VMU_MIDDLEWARE_FAILED` |
| 中间件显式拒绝 | 终止并具名 | `VMU_MIDDLEWARE_REJECTED`（或 `deny.code`） |
| 入参改写（宿主 pre-execute） | **拒绝该动作**（不支持） | `VMU_NOT_PERMITTED` |
| 工具调用超每回合上限 | deny ＋ 说明已用/上限 | `VMU_RESOURCE_BUDGET` |
| 脚本超时 | 硬失败 | `VMU_JOB_TIMEOUT` |
| 内核被禁用 | 任何服务请求被具名拒 | `VMU_STATE`（"the kernel is disabled"） |

---

## 7. 错误码 → 处置速查（**人读视图；`03-§8` 是唯一登记表**）

> **本节只做"看到码怎么办"的速查**，不新增/不改名；**登记以 `03-§8` 为准**；每个码都**必须具名解释**（`03-§8` 的"✅"列）。

| 码 | 一句话语义 | 我该做什么 |
|---|---|---|
| `VMU_INVALID_ARGUMENT` | 参数非法（域外/缺失/类型） | 修参数；**JSON 参数必须是字符串**（`args`/`samples`/`manifest`/`rule`） |
| `VMU_NOT_MEMBER` | 调用者不是可识别成员/角色 | 确认身份（成员/角色槽位）后重试 |
| `VMU_NOT_PERMITTED` | 权限不足（含中间件拦截；**H3 只读键**） | 看回执里的"谁能做"；H3 键**永远不要重试** |
| `VMU_NO_SUCH_OBJECT` | 对象不存在（悬空 id） | 先 `list` 拿真实 id（回执通常附 `use action=list`） |
| `VMU_NOT_FOUND` | 泛型"段/包/脚本/对象不存在" | 按回执的下一步补登/改名 |
| `VMU_STATE` | 状态不允许该操作 | 检查控制面状态（paused/stopped）与阶段门 |
| `VMU_CONFLICT` / `VMU_NAME_CONFLICT` | 声明冲突/命名撞名 | 显式改名或声明覆盖（**内核从不静默解决冲突**） |
| `VMU_VERSION_MISMATCH` | 协议/包版本不匹配 | 对齐 `apiVersion`/manifest 版本（回执给双方版本） |
| `VMU_RESOURCE_BUDGET` / `VMU_QUOTA_EXCEEDED` | 触达预算/配额 | 看回执的当前值与上限；调整 `vmu.limits.*` 或减载 |
| `VMU_PACK_CONFLICT` / `VMU_PACK_MISSING` / `VMU_PACK_KERNEL_OVERRIDE_REFUSED` | 包冲突/缺失/试图覆盖内核强制面 | 先 `pack plan`；改名；**内核面不可覆盖** |
| `VMU_MIDDLEWARE_REJECTED` | 中间件**显式**拒绝 | 看 `middleware id`（回执必须给）；改行为或让该条目放行 |
| `VMU_MIDDLEWARE_FAILED` | 中间件异常/越权/超时/注册失败 | 看 `middleware/failure-policy` 审计与 `consecutiveFailures`（可能已熔断） |
| `VMU_DEGRADED` | 条目在降级窗口（熔断/退避） | 看恢复条件；必要时 `enable` 复位 |
| `VMU_TIMEOUT` / `VMU_JOB_TIMEOUT` / `VMU_JOB_CANCELLED` | 钩子/脚本/作业超时或被取消 | 提高预算或改可恢复实现（脚本面用 `timeoutMs`） |
| `VMU_ENGINE_UNAVAILABLE` | 引擎/接缝不可用（subprocess、pack loader、宿主 ctx） | 按回执注入/启用接缝（工具面不发明接缝） |
| `VMU_STORE_FAILED` / `VMU_WRITE_FAILED` / `VMU_AUDIT_WRITE_FAILED` | 耐久/写盘/审计失败 | **不得静默吞**：看路径与 errno；审计失败须上报 |
| `VMU_BODY_TRUNCATED` | 正文被计数式截断返回 | 用 `expand` 的分页/上限参数取全量（截断数字在回执里） |
| `VMU_PATH_ESCAPE_REFUSED` | 路径越界（`vmu.safety.pathPolicy`） | 改到允许根内；看被拒路径与策略 |
| `VMU_PARAM_RENAMED` / `VMU_PARAM_DEPRECATED` / `VMU_PARAM_REMOVED` | 参数三阶段 | 按回执给出的替代键改名 |
| `VMU_LEAN_*` | 形式化面（工具链/编译/哈希/超时/文件/未结算） | **`VMU_LEAN_COMPILE_FAILED` ≠ 命题为假**；`VMU_LEAN_HASH_CHANGED` **不算 passed** |
| `VMU_FORMAL_*` | 形式化/复现面（含 `sorry`/未受信公理/结论不一致） | 按回执补齐（`sorry` 位置、公理清单、复现缺口） |
| `VMU_MATH_*` | 计算面（输入/量纲/奇异/不支持操作） | 按回执给可用引擎或替代操作 |
| `VMU_MEETING_TOO_SMALL` | 会议参与人数不足 | 补齐参与人或不使用该门槛（门槛由中间件定、**码由内核登记**） |
| `VMU_MIGRATE_*` / `VMU_ROLLBACK_*` / `VMU_COMPAT_UNKNOWN_COMBO` | 迁移/回退/兼容未知组合 | **未知组合不得默认兼容**；无回退点 ⇒ 先落回退点 |
| `VMU_ALIAS_AMBIGUOUS` | 别名多义 | 从候选列表里消歧 |

**三条处置通则**：① **先看回执的 `hint`**（每个码都要求具名解释＋下一步）；② **同一个码连续出现＝配置问题**，不要盲目重试；③ **`ok:false` 永远带 `code`**（若你看到 `error` 而无 `code` ⇒ 那是**工具壳外**的异常，报缺陷）。

---

## 8. 权限矩阵（谁能改什么）

### 8.1 热改等级（HOT，`settings/schema.js`）
| 等级 | 含义 | 生效时点（`vibe_vmu_set` 回执逐字） | 典型 |
|---|---|---|---|
| **H0** | 立即 | `immediately` | 观测/开关类（如 `vmu.middleware.dryRun`） |
| **H1** | 下一回合 | `next turn` | 回合内策略（如每回合工具上限） |
| **H2** | 下一会话 | `next session (restart required)` | 需要重建管线的键 |
| **H3** | **只读（框架所有）** | **拒绝**：`VMU_NOT_PERMITTED` | 内核强制面 |

### 8.2 可写者（`who`，`settings/schema.js` 当前分布）
- `office`：**48 个键**（所办/办公侧设定）
- `role:chair`：**6 个键**（主持侧设定）
> 回执 `who` 字段直接给出该键的可改者；**不在 `who` 里的主体改键 ⇒ `VMU_NOT_PERMITTED`（须说明谁能做）**。

### 8.3 内核强制面（**任何人不可改**）
1. **票权/门槛/计票**：`ballot/*` 钩子只能 `deny`；票值由原语裁定。
2. **结算口径**：`settle/before` 只能 `deny`（不得改写口径）。
3. **`state` 段**：提示词只读事实段（覆盖 ⇒ `VMU_NOT_PERMITTED`）。
4. **审计**：条目只能 `record`/`annotate`，**不能关闭/篡改**。
5. **能力不得自我授予**：未声明即用 ⇒ `VMU_MIDDLEWARE_FAILED`（恒 closed＋计熔断）。
6. **内核区间**：`facts[0,199]`/`charter[200,399]`/`contract[400,599]` 不开放给 pack（`VMU_PACK_KERNEL_OVERRIDE_REFUSED`）。
7. **工具注册面**：工具只在"东西存在"时出现；**零机制时只读一个**（`vibe_vmu_status`）。

### 8.4 机制管理权限（工具 × 动作）
| 动作 | 允许者（默认） | 备注 |
|---|---|---|
| 读（`status`/`list`/`plan`/`validate`/`dryRun`/`brief`/`history`/`receipt`） | 任何可调用者 | 只读，恒有 |
| 写设置（`vibe_vmu_set`） | 按 `who`（`office`/`role:chair`） | H3 一律拒 |
| 机制管理（`middleware disable/enable`） | 机制所有者（部署者/用户） | 未知 id ⇒ `VMU_INVALID_ARGUMENT` |
| 包装载（`pack apply/unload`） | 部署者/用户 | 冲突即拒 |
| 控制面（`control pause/resume/stop/beat`） | 部署者/用户 | pause 是**真门禁** |
| 会议/表决（`meeting *`） | 按原语与政策（主持/成员） | 内核只提供原语 |
| 任务（`task *`） | 按任务台账与阶段门 | 暂停期写操作被具名拒 |

---

## 9. 未核项（**指向 `14-§2`**）
1. 宿主未来是否修掉 **`validateNoNullByte(undefined)`**（M3 `cwd` 缺陷）—— 见 `14-§2 F3`。
2. `prompt/assemble` 与 `prompt/section-assembled` 的**命名统一**由谁改（`05 §5.2`／`06 §17.1` 裁决项）。
3. 7 个**无生产者钩子**的接线计划（`05 §13-3`）。
4. 跨会话/跨进程总线协调（**计划 ✗**）的实现归属。
5. `math_computation` 在 `03-§2` 的"服务＋继承工具"双面表述是否补记。
6. `vibe_vmu_metrics`/`scheduler` 等**计划工具**的最终命名（本卷草案仅供参考）。

---

## 10. 验收判据（**机器可判定，≥2**）
1. **工具名清单一致**：`TOOL_NAMES` 的 9 个值 ＋ `math_computation` **必须**与本卷 §1 表逐字相同（断言：从 `host.js` 导入 `TOOL_NAMES` 并逐名比较）。
2. **action 枚举一致**：每个工具的 `parameters.action.enum` **必须**等于本卷 §2 列出的 action 列表（断言：`toolSpecs(...)` 产出的 schema 与 §2 表逐项比对）。
3. **错误码可登记性**：本卷 §7 出现的每个 `VMU_*` 码**必须**能在 `03-§8` 找到（断言：抽取本卷反引号码，集合差为空）。
4. **钩子名合法性**：本卷 §5.1 的 20 个钩子名**必须**与 `VU_HOOKS` 集合相等；§5.2 的 14 个宿主钩子名**必须**与 `BRIDGED_HOOKS` 集合相等。
5. **零机制**：`vmu.core.enabled=false` ⇒ `plan().names === []`；enabled 且无声明 ⇒ `plan().names === ['vibe_vmu_status']`。
6. **cwd 规避**：`validateRequest({file, args, cwd: undefined})` 的问题列表**包含** `cwd must be a string`（证明"给 undefined 也算给了"这一真实约束）；且 `host-spawn` 注入接缝在缺 `cwd` 时仍传**非空字符串**。

---

## 11. 与 `03` 卷的一致性核对（本任务重点产出之一）
| # | 核对项 | 结论 |
|---|---|---|
| ① | **服务面**（8 个键、条件、未发布项） | **一致 ✓**（§4③；未发现冲突） |
| ② | **错误码** | 本卷 §7 是**人读视图**；登记表在 `03-§8` ✓；**未发现本卷与 `03-§8` 的码名冲突** ✓ |
| ③ | `math_computation` 的"服务 vs 继承工具" | `03-§2` 只登记为服务；实现上它**同时**是代理可调用工具（`vibe-math-vmu.js:149`）⇒ **建议 `03` 补一句**（**不是冲突**，是表述完整性问题）⚠ |
| ④ | **工具面** | `03` 未登记 `TOOL_NAMES` 的 9 个工具（本卷首次给出）⇒ **建议 `03` 增一节引用本卷**（避免两处漂移）⚠ |
| ⑤ | **钩子面** | `03` 未列 20 钩子（`05` 已有）⇒ 本卷与 `05` **一致 ✓**（含 13 ✓/7 ✗ 生产者） |
| ⑥ | **协议版本** | `apiVersion=1` 与 `03-§7` 的 D13-O3 口径**一致 ✓** |

---

## 12. 待裁决（✗）
1. §5.4 的钩子名统一方案（建议：emit 改为 `prompt/section-assembled`，逐段触发）。
2. `rewriteArgs` 在宿主 `tools/pre-execute` 上**永久不支持**（当前具名拒）——是否值得为"改写入参"另立一条 vmu 侧通道？
3. §3 计划工具的命名是否照本卷草案（避免与 `math_computation` 重叠）。
4. `who` 面是否新增主体（当前 `office`／`role:chair` 两档），以支撑更细的机制管理权限。
5. 本卷 §7 是否需要在 `03-§8` 上生成**自动投影**（避免人工同步漂移）。
