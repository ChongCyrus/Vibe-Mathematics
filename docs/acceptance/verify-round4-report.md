# Round 4 · vmu-verify（task-31）交付报告

> 任务：`task-31`（真机 smoke 首项 ＋ 矩阵 v3 ＋ 门禁形状纪律 ＋ F22 变异证明 ＋ activity 复核）
> 纪律：未跑全量 sweep／`regen-all`／git；临时文件在 `D:\_tmp`；**未触碰操作者真实 `~/.dsh`（含其凭据）**。
> 日期：2026-10-15

## 0. 结论速览

| 项 | 状态 | 一句话 |
|---|---|---|
| **A 真机 smoke** | ✅ **真机跑通（1 次 headless ＋ 1 次 web 回合）** | 隔离 profile ＋ 真 installer ＋ 真宿主 ＋ **真模型回合**（provider `dsh-opencode-go` ／ model `deepseek-v4.1-flash`）；回合完成、token 已记；**但本轮未能证明 7 个面被调用**（见 A.2 的两条实测：headless 无 preset 选择器；web 回合 `toolCalls:0`） |
| **B 矩阵 v3** | ✅ | **C-30／C-45 双双改判【等价承载·已闭合】⇒ C 家族空缺归零**；F9/F10/F17/F18/F28 实测改判并入；剩余空缺＝A 1 ＋ B 1（非机制） |
| **C 门禁形状纪律** | ✅ | 包成员审计改为**语句位置**判据 ＋ 自探针：`audit-package-membership` **13/0 EXIT=0**（原 11/1 误报） |
| **D F22 变异证明** | ✅ | 新常驻族 `tests/audit-prompt-behaviour.mutants.mjs` **4/4 EXIT=0**（三处单点变异各让一条行为断言变红＋控制组全绿） |
| **E activity 复核** | ✅ | `audit-enforced-consistency` **355/0**（activity 3 对 `listsIdentical=false` ＋ 1 条拒绝）；activity 三套件 141/0、58/0、14/0 |
| （附带）`vmu-kernel` 13 键 | ✅ | 按"不许写死过期数字"改为三条具名清单派生 ⇒ **175/0 EXIT=0** |
| （附带）`tests/_lib` 双登记 | ✅ | 真实 D-05 缺口（含**我自己的生成器**跨目录 import 该 helper）⇒ 已登记 |

---

## A · 真机 smoke：跑到哪儿为止，为什么停，缺什么

### A.1 已经跑通的部分（**真机**证据，非单元测试）

| 步骤 | 命令 | 结果 |
|---|---|---|
| 隔离家目录 | `New-Item D:\_tmp\smoke-home`；`$env:DSH_HOME='D:\_tmp\smoke-home'` | ✓ 与操作者 `~/.dsh` **完全隔离** |
| 建 profile | `dsh --from-default-profile web --profile vmsmoke` | ✓ 生成 `profiles/vmsmoke/{cordis.yml,cordis.patch.yml,package.json,pnpm-workspace.yaml}`（`default` 模板名会被**具名拒**，合法模板＝`acp/headless/sdk/sdk-minimal/web`） |
| 装本仓 | `dsh plugin --profile vmsmoke add <本仓>` | ✓ **EXIT=0**，`+ dsh-vibe-math link:…/Vibe-Mathematics`；profile `package.json` 的 `dsh.profile.bundles` 含 `dsh-vibe-math` |
| 起宿主 | `dsh --profile vmsmoke --port 7793 --no-open`（后台） | ✓ stdout 给 `dsh web: http://127.0.0.1:7793/?token=…`（**本轮两次起停均成功**） |
| 驱动握手 | `node scripts/dsh-drive.mjs --port 7793 --token … --cwd D:\_tmp\smoke-ws --preset vibe-math-vmu --task-file … --jsonl …` | ✓ transcript：`auth 303`＋cookie → `session/create 200` → `session/prompt` 接受 → 40 次 poll 全部 RPC 200；**`agentPreset:"vibe-math-vmu"` 被接受**（⇒ 我们的 bundle 真机挂载成功、preset 合法） |
| 会话可见 | 自写只读探针（`D:\_tmp\host-introspect.mjs`） | ✓ `session/list 200` 且 `agentAvailable:true`；（`tools/list` 等猜测端点 404——宿主未暴露工具枚举 RPC，不猜了） |

### A.2 凭据到位后的两次真机回合（**这是本轮的真机证据**）

用户授权用其 opencode go 提供商 ⇒ 按"最小开销"配方执行：`D:\_tmp\smoke-home\.credentials.yaml` 由操作者凭据**复制**而来（**跑完已删除**，见 A.5），provider 插件 `dsh-opencode-go 0.1.22` 装进隔离 profile。

**回合 ①（headless，1 次）**：`dsh --profile vmsmoke-h --patch <provider 的 examples/headless.patch.yml> --patch <provider 配置块> "<一行提示词>"`
- 结果：**EXIT=0、真回合完成**（reasoning 可见，模型为 `deepseek-v4.1-flash`）。
- **实测发现（重要）**：模型自述可用工具只有基础面（`pwsh/read/write/...`），**没有任何 `vibe_vmu_*`**。原因不是插件没装（`--dump-config` 显示 `# == dsh-opencode-go`、bundles 含 `dsh-vibe-math`），而是 **headless app 没有 preset 选择器**（`dsh headless --help` 只有 `--json`／`--session-id`）——而我们的工具面由 **agent preset `vibe-math-vmu`** 发布（这正是"框架＝一个 preset"的设计）。
- ⇒ **结论**：`dsh --profile <web> … headless "…"` 这条配方**不成立**（`headless` 是**模板名**，不是子命令：我实测 `--profile vmsmoke … headless --help` 打印的是 **web app** 的 usage），要跑 headless 必须新建 **`--from-default-profile headless`** 的 profile。

**回合 ②（web profile ＋ preset ＋ `--follow-stream`，1 次；按 `docs/slv-playbook.md` 口径记）**：`dsh --profile vmsmoke --patch <provider 默认模型> --patch <provider 配置块> --port 7795 --no-open` → `node scripts/dsh-drive.mjs --port 7795 --token … --cwd D:\_tmp\smoke-ws --preset vibe-math-vmu --task "<一行>" --follow-stream --jsonl D:\_tmp\smoke-out\faces-web.jsonl --timeout 300`

**观测（带 seq ＋ 行号；转录 `faces-web.jsonl`，共 471 行）**
| 观测项 | seq | 行号 | 原文要点 |
|---|---|---|---|
| 任务进入会话（user/message） | 8 | L12 | 我的 1 行提示词 |
| system/message | 7 | L11 | 系统面已装配 |
| **`tool/call`（真机工具调用）** | **16** | **L134** | **`name: "vibe_vmu_status"`** ＋ `callId`/`arguments` |
| **`tool/result`（真机工具返回）** | **17** | **L135** | 该调用的返回消息 |
| `assistant/message`（模型结论） | 15 | L132 | 含 `usage` 与流；其正文（L129 的 `block-end` `block=tool-call`）明确写出**只发布了 `vibe_vmu_status`**，其余四个 `vibe_vmu_wait/chat/panel/activity` **不在可用工具列表** |
| `assistant-stream` 工具调用块 | — | L129 | `chunk=block-end block=tool-call` |
| 模型/行程 | — | L131 | `finish` 的 `replayState`：`provider=dsh-opencode-go`、`sdkProvider=opencode-go`、`model=deepseek-v4.1-flash`、`api=openai-completions` |
| 驱动 `done` | — | L470 | `preset=vibe-math-vmu`、`durationSec=21`、**tokens: in 23006 / out 993 / cacheRead 7808 / total 31807**、`followStreamWorked=true` |

**支持**：① `vibe_vmu_status` 在**真机**被调用并真实返回（`{"ok":true,"instance":"vmu-default","enabled":true,"active":true,"packPath":"loader",…}`）；② 我们整条交付链（隔离 profile→真 installer→真宿主→preset→工具）**可用**；③ provider/model 与用户点名的 `dsh-opencode-go / deepseek-v4.1-flash` 一致；④ ★**"零机制"在真机成立（Lead 裁决：这是 docs/01 R1 的正面证据，不是缺陷、也不是 NON-RESULT）**——该 profile 什么都没声明 ⇒ 内核**只发布 `status` 一个面**，`chat`/`panel` 不在工具列表；这与 `vmu-kernel`／`vmu-entry` 的单测断言（"零声明 ⇒ 恰 1 个工具"）在**真机**上一致 ⇒ **观测 → 支持**。
**不支持／未观测**：`chat list` 与 `panel status` **没有被调用**——它们**不存在于工具列表**（同上：零机制的必然结果，已作为"支持"记录，而非缺口）。
**非结果（NON-RESULT，不得写成 PASS；两条）**：① 本轮**未设 `--max-tokens`**（playbook §4 要求每次设；实际用量 31.8k 在最小档内，但"未设"就是未设）；② **第一条 user message 未声明"模拟测试"**（playbook §2/§5），故转录缺该断言。⇒ 将来要重跑，补齐这两条即可。
**多面点亮留给 Round 5（Lead 已登记 `14-§2` U14）**：preset 的框架行 `id: vibe-math-vmu` **嵌在 `preset-vibe-math-vmu` 声明的 `config.plugins` 里**（`cordis.patch.yml:1868`）⇒ **顶层 patch 按 id 打不到它**（我实测 `--dump-config` 不显现）；而**改随包那一行会让默认不再是零机制** ⇒ **不能为测试改默认**。正确做法＝给该 preset 加"**可声明的测试 overlay**"（或让 DSH 支持嵌套行寻址），届时用 `vmu.tools.faces:['*']`／`vmu.packs.active:['v5r']` 跑**一次**多面会话。我准备的 `D:\_tmp\vmu-declare.patch.yml`（`faces:['*']＋packs:['v5r']＋report.enabled＋minIntervalMs:0`，**无秘密**）留给 Round 5 直接用。

### A.3 具名前置条件（若要跑完 7 面）

1. **一次带流捕获的 web 回合**（`--follow-stream --jsonl`）＋ 用户对这一轮的授权（1 次回合开销）；
2. 或把 **`vibe-math-vmu` 设为 headless profile 的默认 agent preset**（需一个 `agent-default-preset` 之类的补丁节点；本轮未找到该节点的确切 id，未猜）。

### A.4 已备好的材料

7 份任务文件 `D:\_tmp\smoke-tasks\{resume,chat,mailbox,panel,report,activity,fidelity}.txt`；驱动模板命令见上；transcript：`D:\_tmp\smoke-out\{report.jsonl, framework-web.jsonl, framework-headless.txt}`。

### A.5 凭据与清理（按 `docs/slv-playbook.md` §7 纪律：**只删自己的，绝不按时间窗批量删**）

| 动作 | 对象 | 结果 |
|---|---|---|
| 删凭据 | `D:\_tmp\smoke-home\.credentials.yaml`（**临时副本**） | ✅ 已删（`Test-Path` = False）；操作者真实 `~/.dsh/.credentials.yaml` **未动** |
| 删含账号 id 的补丁 | `D:\_tmp\opencode-go.patch.yml` | ✅ 已删 |
| 停实例 | `--port 7793`（我早期启动后被 kill 的孤儿，pid 6952，cmdline 确认 `--profile vmsmoke --port 7793` 是**我的**）、`--port 7795`、`--port 7796` | ✅ 三个端口现均 **free**（停前先用 cmdline 核实归属，**没有**杀任何非我的进程） |
| **保留**（供 Round 5，**不含任何秘密**） | 隔离家目录 `D:\_tmp\smoke-home`（profiles: `vmsmoke`／`vmsmoke-h`／`headless`／`vmslice-h`）、7 份任务文件 `D:\_tmp\smoke-tasks\*`、声明补丁 `D:\_tmp\vmu-declare.patch.yml`、转录 `D:\_tmp\smoke-out\{faces-web.jsonl,framework-web.jsonl,report.jsonl,framework-headless.txt}` | 全部保留 |
| **未做**（纪律要求） | 未按时间窗批量删除任何 session/投影缓存；未触碰他人 profile/会话 | ✅ |

**报告口径**：provider `dsh-opencode-go` ／ model `deepseek-v4.1-flash`；**授权回合数 2**（headless 1 ＋ web 1，均已在上面逐条记录）；token 读数：web 回合 `total=31807`（in 23006 ＋ out 993，含 cacheRead 7808，21 s），headless 回合未记录总量（stdout 经 PowerShell 包装，仅见 reasoning）；**凭据来自操作者授权（opencode go）**，用完即删。

---

## B · 目标 4 矩阵 v3（`04-parity-matrix.md`）

- **C-30 改判【等价承载·已闭合】**：判定点 `kernel/paper.js`（五个 `vmu.paper.officeConsult*`）＋我在 `audit-enforced-consistency` **拒绝场景表里实测** thrown `VMU_OFFICE_CONSULT_REQUIRED`＋`enforced[5]`；自证套件 `tests/vmu-paper-consult.test.mjs`。残余：v5r 的 `notePaperConsult` 是**函数名**，vmu 用工具/服务面承载**同一语义**（名字不同≠语义不同）。
- **C-45 改判【等价承载·已闭合】**：决策在 `kernel/fidelity.js`（三具名拒＋marker `enforcedVote=0.5`/`passedWithdrawn:true`），**唯一强制点** `kernel/ballot.js:210-229`（决定性票 → `kind:'abstain'`、保留 `declared`）；我在门里**直接断言**改写发生且**弃权不能定论**。
- **F 项改判并入 §8.2**：F9 `sendMessage` 缺失→**具备**（`kernel/index.js:263,954,975,1779-1782` ＋ `kernel/turn/index.js:207-225 sendToMember`）；F10 `interrupt` 缺失→**具备**（`kernel/index.js:261-263,955,976,1783` ＋ turn 的 `interruptMember`）；F17 缺失→**条件具备**（`kernel/lean.js:375-376` 的 `graceMs` 请求、`:409-410` 有 handle 报 `terminated:true`／无则**具名**"无法 terminate…进程可能仍在跑"、输出上限 `vmu.math.captureStdoutBytes`）；F18 部分→**具备**（`kernel/resume.js:692-713` 真实使用者、`:761-762 } finally { … releaseRecoveryLock() }`）；F28 缺失→**具备**（`kernel/meetings.js:331/336/348/370`，撤销必须给理由、append-only；`ballotbox` 同形且到期 `outcome:null`）。
- **F11 未变**：`childId`／`stopReason` 全包 **0 命中**。
- **v3 空缺（持续具名可追溯）**：`M-A04` 的"论文轮次上限可调"子项；`M-B20`"边界说明"（**非机制**）。⇒ **C 家族空缺归零**。
- 证据文件同步：`05-framework-strength-evidence.md` **§10**（F9/F10/F17/F18 ＋ reader-c 的 F25/F28/F30/F31，**其 file:line 我逐条 spot-check 过**：`meetings.js:331/336/348/370` ✓、`ballotbox.js:123` ✓；仅 `ballotbox.js:437` 现为 `lapse`，`reopen()` 在同区块——已注明）。

## C · 门禁形状纪律（包成员审计）＋自探针

**修的是一道真误报**：旧扫描 `/ (?:from|import)\s+['"](\.[^'"]+)['"] /` 会把**数据字符串**当 import——`tests/vmu-activity-falsify.test.mjs` 里 `SRC.replace("from './bus.js'", BUFS_URL)` 的**数据**被判成"未随包的 import"。

**新判据（不放宽）**：import 必须处于**语句位置**——
```js
const IMPORT_STATEMENT  = /^[ \t]*(?:import|export)\b[^;]*?from\s+['"](\.[^'"]+)['"]/gm
const SIDE_EFFECT_IMPORT = /^[ \t]*import\s+['"](\.[^'"]+)['"]/gm
```
（`^[ \t]*` 要求行首/缩进起始；`[^;]` 把匹配限制在一条语句内 ⇒ 多行 import 仍可匹配，而**注释与数据字符串不再命中**。）

**自探针（同一门内常驻）**：一段注入源里放 ①数据字符串 `"from './nope-data.js'"` ②调用参数里的 `"from './nope-arg.js'"` ③注释掉的 import ④⑤⑥三条真 import（`import … from`／裸 `import`／`export * from`）⇒ 断言**恰好 3 条**且都不含 `nope`。⇒ "门停止看见 import"与"没有 import 缺失"不再长得一样。

**顺带发现并修的真缺口**：新测试 `tests/vmu-activity-falsify-lib.test.mjs` → `./_lib/falsify.mjs` 未登记；且 `tests/_lib/strip-comments.mjs` 也未登记——而**我自己的生成器** `scripts/generate-wired-schema.mjs` 正 import 它（跨目录、且脚本会随包发布）⇒ 两个 helper 都已进 `files[]`。

## D · F22 的变异证明（新常驻族）

`tests/audit-prompt-behaviour.mutants.mjs`（`*.mutants.mjs` ⇒ runner 会当族作业跑）：
- 拷 `vibe-math-vmu/kernel/prompt/index.js`（**自包含**：零 import，自带 `refuse()`）到临时目录 → 单点变异 → 用**同一套行为探针**（状态事实逐字存活／指向 `state` 的绑定贡献为零／授权覆写生效且仍渲染变量／回滚恢复参考）读**装配后的文本**；
- 三处变异各自必须让**对应**断言变红：① `if (typeof overrides[name] === 'string')`→`if (false)` ⇒ `overrideInEffect` 红；② 装配路径不可变守卫 `if (entry.name === 'state' || entry.mutable === false) {`→`if (false) {` ⇒ `bindingOnStateIgnored` 红；③ `delete overrides[section]`→空体 ⇒ `rollbackRestores` 红；
- **控制组**：未变异副本四条事实全绿（否则"全红"也能冒充证明）；
- 变异目标找不到 ⇒ 该族**自己报红**（不许静默通过）。

## E · activity 复核（`enforced[]` 与场景一致）

- `node tests/audit-enforced-consistency.test.mjs` ⇒ **EXIT=0，355 passed / 0 failed**；`modules with enforced in code` 里含 `activity.js`，其 3 对场景全部 `listsIdentical=false`（`timeoutPolicy`／`timeoutMinMs`／`timeoutMs`），拒绝场景 `wait(timeout outside [min,max])` 为 `thrown` 且带 `enforced[]`。
- activity 三套件：`vmu-activity-kernel` **141/0**、`vmu-activity-tool` **58/0**、`vmu-activity-falsify` **14/0**（其 `.evaluated` 已全部跟随改名为 `enforced`／`enforcedScope`）。

## F · 命令与退出码（原样）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `node tests/audit-package-membership.mjs` | **0** | 13/0（含新自探针；原 11/1 误报消失） |
| `node tests/audit-installer-policy.test.mjs` | **0** | 100/0 |
| `node tests/audit-prompt-behaviour.mutants.mjs` | **0** | **4/4**（控制组＋三变异各自红） |
| `node tests/audit-enforced-consistency.test.mjs` | **0** | 355/0（paper／ballot／activity 场景均在列） |
| `node tests/vmu-kernel.test.mjs` | **0** | 175/0（Lean 13 键＝8＋4＋1，三清单派生） |
| `node scripts/generate-wired-schema.mjs --selftest` | **0** | KEY_SHAPE 自探针 3/3 |
| `node tests/vmu-activity-kernel.test.mjs` / `-tool` / `-falsify` | **0 / 0 / 0** | 141/0、58/0、14/0 |
| `dsh plugin --profile vmsmoke add <本仓>`（隔离 `DSH_HOME`） | **0** | `+ dsh-vibe-math link:…` |
| `node scripts/dsh-drive.mjs … --task-file …report.txt …` | 非 0（回合未产出） | transcript 显示 `auth 303 → session/create 200 → prompt → 40 poll`，**0 token**（凭据缺失，见 §A） |

## G · 交回 Lead

1. **真机 smoke 只差模型凭据**（`MISSING_CREDENTIAL: llm-deepseek`）：请给"授权复制到隔离家目录"或"由你在有凭据环境跑我备好的 7 份任务文件"其中一条；命令与任务文件已就绪（§A.4）。
2. 矩阵 v3 的 **C 家族空缺已归零**；仍缺 A-1（论文轮次上限可调）与 B-1（非机制说明）。
3. F11（`childId`/`stopReason`）与 F28 的 `stop{scope:'step'}`（GAP-MTG-05 的另一半）建议下一轮或**具名登记为"不做"**。
4. 生成器 `--selftest` 的执行点已在 criterion 的 RULE A 里；`regen-all --check` 仍待你的收尾 regen。

---

## H · 追加批（Lead 后续两条）· 原样命令 + 退出码

### H.1 新门禁：`bus.emit(` 首参不得是**对象字面量**

`tests/audit-bus-emit-shape.test.mjs`（已登记 `files[]`）⇒ **EXIT=0，3 passed / 0 failed**。
- **规则窄而准**：`bus.emit(` 之后**第一个非空白字符是 `{`** ⇒ 红（无豁免名单；对象当话题没有合法形态）；字符串/模板字面量 ⇒ 合格；**变量/表达式 ⇒ 不设卡，只计数并列出**（本仓"计数并报告"惯例）。分类器还会**跳过 `(` 与首参之间的注释**（`bus.emit(/* 理由 */ { … })` 仍判红），并有**自探针**（6 个合成样本：对象／换行后对象／注释后对象 ⇒ DEFECT，单引号／反引号 ⇒ GOOD，变量 ⇒ report-only）。
- **实测结果**：**首参为对象字面量 = 0 处**；字符串字面量话题 **68** 处；**变量/表达式话题 49 处**（已列出，供人复核；与 Lead 报的 41 处差异源于我的口径含 `.bus.emit(`／`X.bus.emit(` 且逐文件统计）。
- ★ **Lead 报的 5 处现已全部是合法形态**（我逐行核过）：`board.js:130`、`projmigrate.js:112`、`skills.js:114`、`topology.js:172`、`trust.js:178` —— 现在都是 `bus.emit('<topic>', { …payload })`（**话题字面量在前、payload 对象在后**）⇒ 该门当前**绿**，不是放水；若这 5 处此前确为对象首参，说明 owner 已在本轮修好。

### H.2 RULE E 两条新增指纹（一条我修，一条交 owner）

- **我方**：`tests/audit-prompt-behaviour.mutants.mjs` 的 `A:for:MUTATIONS` ⇒ 在循环前加**非空断言** `ok(MUTATIONS.length > 0, 'the mutation list is non-empty (a loop over an empty list would prove nothing)')`；该族复跑 **GREEN**（4/4＋该守卫）。
- **vmu-activity 方**：`tests/vmu-activity-timers.test.mjs` 的 `A:for:known` —— **我不改其文件**，结论已发 owner。**当前实测**：`RULE E fingerprints: current=67 baseline=67`（**新增=0**）⇒ 该指纹此刻已不在新增集里（owner 可能已自行修好或已被守卫覆盖）；建议 owner 自行确认"`known` 那圈非空"。

### H.3 RULE C 新盲点：`checked`

机械发现新字段 `checked`（**不是**我引入）⇒ 按该门规矩**补进声明表**（带含义＋来源）：`kernel/resume.js:649` 的回读回执 `{ consistent, checked: expectations.size, drift }`、`:889` 转进 recovery 报告的 `readback` 步（"checked"＝真正比对的期望条数，把"我们核过了"变成测量）；并注明 `host.js:326` 的 `checked:false`（工具过滤直通）是**同词不同面**，故须写来源。

**criterion 现况**：`node tests/audit-declaration-criterion.test.mjs` ⇒ **EXIT=1**，**只剩 1 条** `regen-all --check really runs green`（属你的 regen 步）；RULE C／RULE E 均已清空（RULE E `67 = 67`）。
