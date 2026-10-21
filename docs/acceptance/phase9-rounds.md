# PHASE 9 —— PTC／Lean／环境／信箱／可检视／轮次记录（目标 1–6）

> ★ **本卷来源**：创始人对 PHASE 9 中 PTC 与 Lean 两处处理的追问，以及后续三条追加（环境适配扩到数学计算全部环境／信箱分级语义／`wait_agent` 是否复用）。
> ★ **本卷逐轮追加**：每轮记录 **做了什么、真机或夹具证据、修掉的缺陷、被推翻的结论**；数字以当轮命令输出为准，不手抄未来值。
> ★ **本卷不把“已修”写成“已验”**：真机原文来自本会话的实测报告；夹具证据来自仓库测试。两者分开标注。

---

## §0 来源与范围

| ★ # | ★ 来源 | ★ 本卷的处理 |
|---|---|---|
| 1 | 创始人追问 **PTC 与 Lean 两处处理** | 撤 PTC、Lean 诊断链、真机失败层次前移 |
| 2 | 追加：**环境适配范围扩到数学计算全部环境** | `vmu.env.needs` 默认表、`vibe_vmu_env` 的 probe/list/report |
| 3 | 追加：**信箱分级语义** | 发送方显式 urgent、默认空 urgentKinds、非紧急不带正文 |
| 4 | 追加：**`wait_agent` 是否复用** | 作为目标 5 的边界问题记录；本卷不把它写成已解决 |
| 5 | 本阶段新增纪律：**每轮记录到 md** | 本卷即该纪律的产物 |

---

## §1 六个目标（简写）

| ★ # | ★ 目标（简写） |
|---|---|
| 1 | **PTC 收口**：撤掉 v5r 的 `ptc`，回到“工具由提示词与 wire 同源驱动” |
| 2 | **Lean 形式化面真机可用**：命令解析、文件读取、退出码、诊断全链 |
| 3 | **数学环境适配**：覆盖数学计算所需的 Python／Lean／LaTeX／node／pwsh／git／CAS；只探测，不安装、不联网，缺失可上报 |
| 4 | **信箱分级语义**：紧急由发送方显式；非紧急提示不带正文；`read` 与 `ack` 分离；状态机可读 |
| 5 | **可检视**：每个成员“实际可见工具／提示词要点／实际回执”能被一条命令导出并自动对账 |
| 6 | **持续记录**：每轮完成情况持续写入 md（本卷） |

---

## §2 轮 1：撤 PTC 与 Lean 诊断

### 做了什么
- **撤 v5r 的 `ptc`**：非 native 的声明必须在 pack 提示词里有对应 marker，否则 `validatePack` 报 problem、`apply` 拒；`promptAck` 机制落地。
- **同源断言补 wire 层**：用宿主 `register` 的 spec 名做 38/38 对账，避免只断言提示词自洽。
- **Lean 诊断字段全暴露**：`resolved`／`doneError`／`resolveError`／`spawnError`／`cwd`／`pathPrefix`／`signal`／`timedOut`；新增 `VMU_LEAN_COMMAND_NOT_FOUND`。

### 证据
- `tests/vmu-lean.test.mjs`（当轮断言 resolved/doneError 等字段）；
- `tests/vmu-host.test.mjs` 的 spec 名 38/38 同源断言；
- 代码：`kernel/lean.js`、`host.js` 的 `wireTools` 同源块。

### 被推翻的结论
- **轮 1 曾把 Lean 失败归因于“宿主的 workspace-write 沙箱拒绝执行该路径”** ⇒ **轮 6 被真机推翻**：root 与成员会话都是 `sandbox/mode = danger-full-access`（成员为 `{mode:"danger-full-access",source:"delegation"}`），`approval/policy = never`，root 自己跑 `lean --version` 成功（Lean 4.34.0）。沙箱不是阻塞点；**该结论已作废**。

---

## §3 轮 2：信箱重排

### 做了什么
- `urgent` 改成**发送方显式**，默认 **false**；`urgentKinds` 空默认（kind 不再自动紧急）。
- 非紧急投递的 envelope `entries: []`，**提示词不带正文**；紧急才带正文。
- 新增 `subject`／`read`／`todo`／`list`／`open`／`setState`。
- **`ack` 与 `read` 分离**：非紧急 flush **不 ack**，否则正文会在成员读之前被删。

### 证据
- 真机：非紧急提示原文 `【信箱】你收到 1 条新留言（来自 office）。标题：非紧急进展同步-A7。…`；正文标记 `非紧急正文-不应进提示词-K9Q` 在模型可见文本 0 命中，只出现在 `open` 回执。
- 夹具：`tests/vmu-mailbox.test.mjs` 的 `entries:[]`、`read`/`ack` 分离、`SECRET_BODY_MARKER_9f2` 反查。

### 修掉的缺陷
- 原先“非紧急”仍可能因 kind 自动紧急；`read` 与 `ack` 混用会提前删正文。

---

## §4 轮 3：陈旧 pack 值 / 模型发不出的参数

### 做了什么
- 定位：`packs/v5r/settings/defaults.json` 的旧七种 `urgentKinds` **显式值盖住 schema 空默认**；该显式值已删除（pack 写域由另一路完成），并加断言“v5r 的值层不得声明该键”。
- **反断言**：显式旧七种列表若真的被声明，内核仍**原样生效**（内核不许劫持政策值）。
- **`urgent` 参数模型发不出来**：宿主发布的是 `spec.parameters` 映射，缺键会被静默剥掉；修在**已部署 schema** 上断言。

### 证据
- `tests/vmu-v5r-tools.test.mjs` §7k：v5r 值层不含 `vmu.mailbox.urgentKinds`；
- `tests/vmu-mailbox.test.mjs`：`urgentKinds: []` ⇒ 不紧急；显式旧七种 ⇒ 仍紧急；
- 已部署 schema 的 `urgent` 参数断言（真机“发不出来”的反例）。

### 教训
- **陈旧显式值比“没设”更糟**：它看起来配置过，语义却是旧的。

---

## §5 轮 4–7：同源渲染、flush、readHash/grace/why、命名与诊断面

### 轮 4：`slv-inspect` 抓到真漂移 ⇒ 同源渲染
- 真机/夹具：`RED promptTools missing from wire: …`、`RED wire tools not named in prompt: vibe_vmu_tools`；成员 wire 被 per-turn `tools:{allow}` 收窄到 1，提示词仍是角色全清单。
- 修：在 `system-prompt/assemble` 的同一 hook 里**只算一次** `effectiveNames = out.tools`，**同一 `out.tools` 既喂 wire 又渲染** `v5r-effective-tools` 短块；全仓只有一份名字表。
- `tools:'none'` ⇒ 块写 `0 个`，不退化成空块/沿用上次。
- pack 占位段：三段同名会 `VMU_PACK_CONFLICT` ⇒ 改**唯一段名 + 文本标记**；无占位则 append 并记 `effectiveBlock:appended`。

### 轮 5：红线 4 普查 + `readHash` + `graceMs` + `why`
- **`mailbox.flush` 零生产调用者**（红线 4 实例）：修在已有成员 assemble hook，非紧急只注入 notice、紧急带正文；`status().delivery` 增计数。
- **同类普查**：`scripts/audit-no-consumer.mjs` 输出 **A=0／B=29／C=0／D=0**，并声明扫描器盲区（只枚举顶层 function/const + kernel 服务方法，对象内部私有方法未全量枚举）。
- **`readHash` 用进程 cwd 而文档说 root**：改为 `resolvePath(root, file)`；反断言“切换 cwd 后仍读 root，cwd 同名文件不读”。
- **env probe 缺 `graceMs`**：probe 请求带 `timeoutMs + graceMs`；七个 spawn 点全核（env/lean/latex/formal/mathjobs/mathadapters/script-bridge）。
- **`why` 不在 `prompt.assemble` 参数里**：追加 `【本轮指令】` 与 `instructionDelivered`；`NO_OPEN_MEETING` 包装。

### 轮 6：包装码改名
- `VMU_TURN_FIELD_NOT_CALLED` → **`VMU_TURN_FIELD_NOT_APPLICABLE`**：字段**给了**，只是该回合没有工具能产生它；“不适用于本回合”比“没调用”准确。保留 `cause`（原会议错误），message 带底层原因。

### 轮 7：`slv-inspect` 的假红是它自己
- **假红根因**：它只读用户消息，没并入 `system-prompt` 追加消息；修后 `sessions-r6` **0 RED**。
- 静态清单降 **INFO**；**同源块才是权威**。

### 轮 8–9：字段名、尾输出、step 回执、紧急消息一致性
- **Lean `doneValue` 真机读到**：`{"exitCode":1,"signal":null}`、`handleKeys` 含 `done/terminate/waitForExit` ⇒ 通道是通的，**`lean.js` 却读 `r.exitCode` 而 `host-spawn` 返回 `{code}`** ⇒ 一行字段名缺陷。
- **双保险**：`lean.js` 读 `r.exitCode ?? r.code`；`host-spawn` 同时返回 `code` 与 `exitCode`；两种形状都断言到 `EXIT_NONZERO`。
- **`lean_job` view** 增 `stdoutTail`／`stderrTail`（各截 2000）；`EXIT_NONZERO` message 带 stderr 尾部；**只进 job view，不进 status**。
- **`step` 回执** 增 `instructionDelivered`（此前只有 `run` 有）。
- **紧急消息 UX**：紧急正文进提示词但**不再 ack**；条目留在信箱，`list` 的 N 与提示词一致，`open` 读正文，`ack` 显式结算。

---

## §6 真机证据（逐条原文；来源见标注）

> ★ 以下 1–6 条来自**本会话的真机报告**；仓库内**无法复现**真机请求，故不把它们标成“已从仓库命令核到”。能在仓库里核到的，另注测试/文件。

1. **非紧急提示词原文**（真机报告）：
   `【信箱】你收到 1 条新留言（来自 office）。标题：非紧急进展同步-A7。不需要立即阅读，有空再看；用 list 查看、open 打开。`
   正文标记 `非紧急正文-不应进提示词-K9Q` 在模型可见文本 **0 命中**，只出现在 `open` 的工具回执。
2. **紧急提示词原文**（真机报告）：
   `【信箱】【紧急｜对方希望尽快回复】1 条留言… 紧急正文：…请尽快在线回复一句确认。`
3. **list→open→二次 list→mark→list 全链**（真机报告）：list 8 字段无正文 ⇒ open 给正文并 `read:true` ⇒ `mark todo` ⇒ 末次 list 见 `read:true, todo:true`。
4. **同源块进请求**（真机报告）：四回合块名 == header（`vibe_v5_inbox`／`vibe_v5_inbox`／`vibe_v5_record_progress`／`vibe_v5_wait`），模型 thinking 引用了它。
5. **Lean 失败层次前移**（真机报告）：`FILE_UNREADABLE` → 文件读到 → `EXIT_UNOBSERVED`；原文 `resolved="D:\\.elan\\bin\\lean.EXE"`、`hadHandle:true`、`exitCode:null`、四个 error 全 null。
6. **`wait` 2000ms 被正确拒**（真机报告）：低于下限 10000ms，返回具名 `VMU_ACTIVITY_INVALID_TIMEOUT`（仓库内 `TIMEOUT_BOUNDS` 可核到 `[10000, 3600000]`）。

> ★ **无法从仓库/命令核到的**：§6 的 1–6 全部是**真机会话文本**；仓库只能核到产生它们的机制（`kernel/mailbox.js`、`host.js` 的 `v5r-mail-notice`、`kernel/lean.js` 的 `doneValue` 字段、`kernel/activity.js` 的 `TIMEOUT_BOUNDS`）。本卷把来源写在此处，避免读者误以为这些原文可从 `regen --check` 得到。

---

## §7 目标对账（按当前实际状态）

| ★ # | ★ 目标 | ★ 证据 | ★ 状态 |
|---|---|---|---|
| 1 | PTC 收口 | v5r 无 `ptc`；`promptAck` 在 `validatePack`/apply 生效；38/38 wire 同源断言 | ✅ |
| 2 | Lean 真机可用 | 文件读到、命令解析、句柄启动；**`EXIT_UNOBSERVED` 的 `doneValue` 真机值尚未读到** | 🟡 |
| 3 | 数学环境适配 | `vmu.env.needs` 22 项；`vibe_vmu_env` probe/list/report；env probe 带 `timeoutMs/graceMs`；源码探针无安装/网络 | ✅（probe 真机待下一轮） |
| 4 | 信箱分级语义 | 非紧急/紧急真机原文；`entries:[]`；`read`/`ack` 分离；list→open→mark 全链 | 🟡（`wait`/唤醒整链仍未验） |
| 5 | 可检视 | `scripts/slv-inspect.mjs` 一条命令 + 双向差集；`sessions-r6` 0 RED | ✅ |
| 6 | 持续记录 | 本卷 | ✅ |

---

## §8 本阶段最贵的五条教训

1. **“设了值”≠“生效了”的新变体**：
   值设了但**参数没传**（`why` 不在 `assemble` 参数里）／**缺键被静默剥掉**（`urgent`）／**陈旧显式值盖住默认**（`urgentKinds`）／**机制有但零调用者**（`mailbox.flush`）。
   ⇒ 每一种都必须**读回确认**，不能只信“我设了”。
2. **错的名比不名更糟**的新实例：
   `NOT_CALLED`（字段明明给了）⇒ 改 `NOT_APPLICABLE`；**且“包装一个码”必须保住原因**（message 里带 meeting 错，`cause` 保留）。
3. **诊断面本身属于被测系统**的新实例：
   `slv-inspect` 报了**假红**（只读用户消息，没并入 `system-prompt` 追加消息）⇒ **它自己也要有 selftest ＋ 旧格式标 INFO**。
4. **扫描器会“空过”**：
   三条假阴性：只数 `name(` 漏回调、正则吃全角括号、只收 `.js` ⇒ **“报 0”之前必须先证明判据能命中**（每个探针带 `--selftest`）。
5. **我们的结论会被测量推翻**：
   **沙箱结论（R1 下、R6 翻）** ⇒ **记下来，别当耻辱**；测量推翻结论正是本仓的可靠来源。
