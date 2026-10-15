# Round 5 · vmu-verify（task-34）交付报告

> 任务：`task-34`（真机 smoke 第二轮 · playbook 合规 ＋ 矩阵 v4 ＋ 证据主表刷新 ＋ falsify 推广）
> 纪律：未跑全量 sweep／`regen-all`／git；临时文件 `D:\_tmp`；**凭据副本用完即删**；**未碰操作者真实 profile**。
> 日期：2026-10-15

## 0. 结论速览

| 项 | 状态 | 一句话 |
|---|---|---|
| **A 真机 smoke 第二轮** | ✅ **§2/§4 两条 NON-RESULT 已收口**；⚠️ **多面点亮【未建立】——根因已定位（入口 settings 形态），非提示词问题** | 三段真机会话共 3 次（≈71.8k tokens）；`vibe_vmu_status`＝**实测具备**（`tool/call` L18 seq16 ＋ `tool/result` L19 seq17）；`chat`/`panel`/`report` **未被发布**（模型原话 *"The others don't exist. I should not fabricate."*）⇒ **发布问题**：overlay 的**嵌套形态**注册期已合并（`tests/audit-preset-overlay-merge.test.mjs` **21/0** ✓），但入口 `readSettings()`（`vibe-math-vmu.js:54-59`）**只收 `vmu.` 前缀的点号键** ⇒ **静默丢弃**。修法与判据见 `04-parity-matrix.md` §9.1（**Round 6 首项**） |ssage` **seq 8 / L12** 含「模拟测试」✓；`--timeout 300 --max-tokens 40000` ✓（`tokenCap:40000, tokenCapHit:false`）；`tool/call` seq 16／`tool/result` seq 17（`vibe_vmu_status`）✓。**U14 的 overlay 已进仓但实测会覆盖 preset 本体**（见 §A.6：带 patch ⇒ dump 少 187 行、`id: vibe-math-vmu` 消失 ⇒ `session/create` 报 `agent-preset/not-found`，正是 vmu-assistant 转录里的错）⇒ **已派 core 修**，修好前**不声称任何多面证据** |
| **B 矩阵 v4** | ✅ | **6 条 F 项改判【具备】**（F26／F31／F32／F34／F35／F39，各有 `file:line`＋自证套件）；**2 条维持**（F13 部分＝fail-closed 刻意；F53 部分＝边界事实存在） |
| **C 证据主表刷新** | ✅ | §1/§2/§3/§4/§5/§6/§7 **七张主表的收口行全部改成 R4/R5 现状**（＋新增 §10.6），**"主表说缺失、§10 说具备"的双口径已消除** |
| **D falsify 推广** | ✅ | 新族 `tests/vmu-chat-quota.mutants.mjs` **GREEN**：三处单点变异各改变可观测读数；★ 库的 `MUTATION-NOT-APPLIED` **当场抓到我自己的歧义锚点** |

---

## A · 真机 smoke 第二轮（按 `docs/slv-playbook.md` 合规）

### A.1 观测（带 seq ＋ 行号；转录 `D:\_tmp\smoke-out\faces-r5.jsonl`，共 423 行）

| 观测项 | seq | 行号 | 原文要点 |
|---|---|---|---|
| **`user/message`（首条，§2 断言落点）** | **8** | **L12** | 提示词**以「模拟测试：…」开头** ⇒ grep 到原句 = **true** ✓（其后 seq 9／10 两条 user/message 不含该句，是会话内的后续注入） |
| `tool/call` | **16** | **L163** | `name: "vibe_vmu_status"` |
| `tool/result` | **17** | **L164** | 该调用的真返回：`{"ok":true,"instance":"vmu-default","enabled":true,"active":true,"packPath":"loader",…}` |
| 模型结论（assistant/message） | 20 | — | 原话：`2) vibe_vmu_wait: 该工具在本会话不可用（工具清单中不存在），无法调用，无返回 JSON。` |
| 驱动 `done` | — | — | `preset=vibe-math-vmu`、`durationSec=15`、**tokens in 29508／out 719／cacheRead 1152／total 31379**、**`tokenCap:40000`、`tokenCapHit:false`**、`title:"模拟测试：依次调用 vibe_vmu_sta…"` |
| provider/model | — | — | `dsh-opencode-go` / `deepseek-v4.1-flash`（回执 `replayState` 逐字） |

### A.2 支持

1. **§2 合规达成**：首条 user message 的**原句**在转录的 `user/message` 事件里可 grep，且给出了 **seq 8 ＋ 行号 L12**。
2. **§4 合规达成**：`--timeout 300` 与 `--max-tokens 40000` **都设了**，且 `tokenCapHit:false` ⇒ 上一轮两条 NON-RESULT（未设 `--max-tokens`／未声明模拟测试）**本轮双双收口**。
3. **交付链复现**：隔离 profile→真 installer→真宿主→`preset: vibe-math-vmu`→`tool/call`＋`tool/result` 真返回；provider/model 与用户指定一致。

### A.3 不支持／未观测

**我这一次会话（零声明、未加 overlay）只有 `status` 一个面可达**：模型明确报了 `vibe_vmu_wait` 不在工具清单，`chat`／`panel` 同理。**多面点亮【未建立】**，原因是 §A.6 的 U14 缺陷（不是探针、不是凭据、也不是"没跑"）。

### A.4 非结果（NON-RESULT，不得写成 PASS）

- **我这一轮没有取得 ≥3 个面的真机调用证据**——我那一次会话是**零声明**的，只覆盖 `status`；把本次会话写成"多面 smoke 通过"会是假话。
- **多面点亮【未建立】——最终口径（R5 收口）**：三段真机会话里，`vibe_vmu_status` 一次被真调用（`tool/call` **L18 seq16** ＋ `tool/result` **L19 seq17**，`session-84e91216…`，provider/model＝`dsh-opencode-go`/`deepseek-v4.1-flash`，tokens 32157／cap 40000 未触）；`chat`／`panel`／`report` **未被发布**（模型原话 *"I only have vibe_vmu_status … The others don't exist. I should not fabricate."*）。**这是发布问题，不是提示词问题**（提示词已显式点名）。根因：overlay 的**嵌套** `vmu:{tools:{faces:[…]}}` 在**注册期已真合并进内层行**（`tests/audit-preset-overlay-merge.test.mjs` **21/0** 证明 ✓），但**入口 `readSettings()`（`vibe-math-vmu.js:54-59`）只保留"键本身以 `vmu.` 开头"的点号键** ⇒ 顶层键 `tools` 被**静默丢弃**。修法＝入口兼容嵌套/点号两形态（无法解析的设置键要**具名告警**）或 overlay 直接产出点号键；**并补"注册之后入口真的发布了该面"的运行时断言**（比注册期断言更靠后一环）。详见 `04-parity-matrix.md` §9.1。

### A.6 ⚠️ 阻断：U14 的 overlay 实测**不成立**（会覆盖 preset 本体）

```powershell
$env:DSH_HOME='D:\_tmp\smoke-home'
dsh --profile vmsmoke --dump-config                                  # 3405 行；`id: vibe-math-vmu` 出现 2 次；`faces:` 0
dsh --profile vmsmoke --patch D:\_tmp\vmu-overlay.yml --dump-config   # 3218 行（−187）；`id: vibe-math-vmu` **0 次**；`faces:` 1
```
`preset-vibe-math-vmu` 区域（同一条命令的 dump）：
```
# 不带 patch                              # 带 patch（照 docs/02 §318 配方写的 overlay）
- id: preset-vibe-math-vmu                - id: preset-vibe-math-vmu
  name: …/preset-declaration                name: …/preset-declaration
  config:                                   config:
    id: vibe-math-vmu        ← 身份          overlay:              ← ★ patch 的 overlay 键被【原样放进 config】
    name: Vibe Math Unify                     vibe-math-vmu:
    description: …                              vmu:
    order: 25                                     tools: { faces: ['*'] }
    plugins:            ← 内层行                  packs: { active: ['v5r'] }
```
⇒ **preset 的 `id` 与整个 `plugins:` 体被 patch payload 覆盖**（不是"按 id 深合并进内层行"）⇒ `session/create {agentPreset:'vibe-math-vmu'}` 必然报 **`agent-preset/not-found: Unknown agent preset: vibe-math-vmu`**；vmu-assistant 的转录（`D:\_tmp\host-slice-out\vmu-host-slice-1791982726600/transcript.jsonl`）**逐字如此**，其 `available` 列表里 v2–v5r 在、**vmu 不在**。
**口径修正（防误读）**：那次 `--dump-config` 里出现的 `faces:` 是 **patch 原文**，**不等于**"已合并进内层行"——据此判"U14 可用"是**假阳性**（已回报 Lead 转告 vmu-assistant）。
**修法方向（已发 core）**：装配时把 `config.overlay` **摘出**、只用于按 `id` 改写 `config.plugins[]` 的对应行；匹配不到则**具名告警且不改任何东西**；**最终 config 不得残留 `overlay` 键**。回归断言建议：①带 patch ⇒ 身份与 `plugins` 体完好＋内层行生效；②不带 patch ⇒ 与历史逐字节一致（零机制不变）；③未匹配键 ⇒ 具名告警且 dump 无变化。

### A.6.1 第二设计复核 —— **判据更正：结论待【运行时】复核（dump 不能判合并）**

**我先前的一条判据是错的（自我更正）**：我拿 `--dump-config` 里"内层行 `- id: vibe-math-vmu` 的 config 块没有 `faces/active`"判"① 未合并 ⇒ 不通过"。core 指出并确认（我认）：**`--dump-config` 是 loader 树、不是运行时定义**；第二设计的合并发生在 `preset-declaration` 的**注册期**（`apply` 收到 `overlayFor`/`rows` ⇒ 注册时 `applyOverlay` 按 id 深合并进 `config.plugins`），**dump 根本照不出来**。我犯的是"dump 出现 `faces` ⇒ 以为合并了"的**反面**同类错误（把 dump 当运行时）。

**仍然有效的观测**（三种情况都复现过）：内层块**逐行相同**；带 overlay2 多出的 15 行**全是 overlay 行自己的 payload**；未匹配 key 在 **stderr** 上**无告警**。★ 但这三条**只能否定"dump 层面发生了合并"**，**不能否定机制**。

**core 给的运行时证据（待我独立复核）**：dump 层面 A/B 唯一差异＝overlay 行自己的 config（＋一行注释），`preset-vibe-math-vmu` 的 config **逐字节相同**（**身份保留＝第一设计缺陷已修** ✓）；**运行时探针 16/0**：无 overlay ⇒ 注册定义与随包**逐字节一致**；有 overlay ⇒ 内层行 `tools.faces`/`packs.active` **合并且原有字段保留**、其它行不动、定义里**不残留** `overlay`/`overlayFor`、`plugins` 未被原地改；未匹配 ⇒ **具名告警且定义不变**；被覆盖 ⇒ **具名告警且不注册**。

**本轮收口口径（已复核 ⇒ 机制可用）**：**机制【可用】✓**。复核方式（全部免费，不靠 dump 判合并）：① **仓内常驻测试** `tests/audit-preset-overlay-merge.test.mjs` ⇒ **21 passed / 0 failed EXIT=0**（core 的 16 条 ＋ 我加的三条：**反向行序也合并**、**无 `agentPresets` 时 `apply` 不抛**、**每用例独立模块实例**——第一次跑时用例①注册的 overlay 污染了"零机制"用例③，查出是**模块级注册表 + 测试共用实例**的**测试写法问题**，非产品缺陷）；② **dump 层面独立交叉验证**（按内容定位行）：preset 行整块 **204 行逐字节相同**、内层行**逐字节相同**，总差 **+15 ＝ overlay 行自己 +14 ＋ patch 注释 +1**；③ 不带 patch ⇒ 注册定义与随包**逐字节一致**；④ ★ **免费预检**：`POST /api/session/create {agentPreset:'vibe-math-vmu'}` ⇒ **http=200 ok=true**（先前是 `agent-preset/not-found`）⇒ preset 在该实例可用。**多面点亮**的最终状态由 vmu-assistant 那**1 次**会话决定（Lead 已授权，实例＝我起的 `--port 7798`）；其读数到达后本节回填为"**实测具备（附 seq/行号）**"或"**仍未建立＋模型原话**"。

### A.5 清理（`docs/slv-playbook.md` §7：只删自己的、绝不按时间窗批量删）

| 动作 | 对象 | 结果 |
|---|---|---|
| 删凭据副本 | `D:\_tmp\smoke-home\.credentials.yaml` | ✅ 已删（`Test-Path`=False）；操作者真实 `~/.dsh/.credentials.yaml` **未动** |
| 删含账号 id 的补丁 | `D:\_tmp\opencode-go.patch.yml` | ✅ 已删 |
| 停实例 | `--port 7797`（本轮唯一实例；vmu-assistant 确认不跑后立即停） | ✅ 端口已释放（停前用 cmdline 核实归属为我的 `--profile vmsmoke`） |
| 保留（无秘密，供 Round 6 直接复用） | `D:\_tmp\smoke-home`（profiles `vmsmoke`／`vmsmoke-h`／`headless`／`vmslice-h`）、`D:\_tmp\smoke-tasks\*`、`D:\_tmp\vmu-declare.patch.yml`、本轮转录 | ✅ |
| **未做** | 未按时间窗批量删 session/投影缓存；未触碰他人 profile／会话／进程 | ✅ |

---

## B · 目标 4 矩阵 v4（`04-parity-matrix.md`）

新增 **§9 v4 改判（Round 5 · 8 条 F 项）**，逐条给 `file:line`：

**6 条由"部分／缺失"改判【具备】**（全部我核过锚点或复跑过套件）：
- **F26 五种票型分离**：`ballot.js:38` `VOTE_KINDS = ['for','against','abstain','unable','estimate']`（恰好五种、冻结导出）＋`:41 classifyVote`（唯一分类点）＋`:57 DECISIVE_KINDS`；`status().byKind` 五类分计。
- **F31 原子队列**：`ballot.js:189 castNow`（唯一临界区）＋`:335` 同一条 FIFO 链包装＋`:432 status().gate={serialized,pending,commits}`；**原判差的不是形式**——`cast` 内的 `await bus.emit` 让两票可交错；现断言同成员并发恰一票落、`gate.commits===2`。残余＝**进程内**（跨进程耐久原子仍缺，快照如实列入 `skipped: commit-gate`）。
- **F32 去重窗口**：`dedupWindowMs`（0＝零机制）＋`status().dedup`＋快照携带 `lastClose`（重启仍生效）；三条诚信边界（只折叠同结论／折叠仍须收束／有中间件 tally 则不猜）。
- **F34 开启辩论资格**：`open({by})` 的 `openers`/`minEligible`/`requiresTarget` ＋ `status().openCriterion`；顺带修掉"close 后 open 带旧票重开"。
- **F35 DAG 环检测**：`tasks.js:54-75 findDependencyCycle`（返回环路径，`:75` 自环＝长度 1）。
- **F39 写域 advisory**：`tasks.js:82-83 normalizeWriteScope`＋`:180-182 writeScopeConflicts`（注释逐字 *"Never refuses anything"*）。

**2 条复核后维持**：**F13**＝部分（`host.js:319/329/858` 仍 fail-closed，语义与 v5r 刻意相反）；**F53**＝部分（直连 fs 模块集合未变、策略层无 IO，仍缺显式声明）。

**F15 收尾口径**：两处无句柄退避 sleep **不算缺失**，而是**具名豁免**（reader-b 写入 `docs/11` 的 **§11.ap**；★ 授权原拟 `11.ad`，因该字母已被"巡检"占用而顺延——**本矩阵不重复其内容、不与 reader-b 双写**）。

---

## C · 证据文件主表刷新（消除双口径）

`05-framework-strength-evidence.md`：**七张主表**的收口行全部改成 R4/R5 现状并各自指向 §10：§1（F9/F10/F11 具备；F13 部分）、§2（F15 具备＋具名豁免／F17 条件具备／F18 具备）、§3（本组全具备；F22 已可证伪并推广）、§4（**F26/F28/F30/F31/F32/F34 六条全部具备**）、§5（**F35/F39 具备**）、§6（**F44/F45 具备**，F43/F46/F47 维持）、§7（**F49/F50 具备（加厚）／F51 具备／F52 缺失／F53 部分**）。
另新增 **§10.6「R5 改判（逐条 file:line）」**：F26/F31/F32/F34/F35/F39/F49/F50/F51 ＋ reader-b 的 F43–F47 旁证 ＋ R5 新族；并保留 **F51 的唯一具名缺口**（v5r 的 `meetingOpen` 域标记在 vmu 无等价物，owner＝会议面）。

---

## D · falsify 推广到第二个族（chat 配额）

`tests/vmu-chat-quota.mutants.mjs`（`*.mutants.mjs` ⇒ runner 会当族作业跑；已登记 `files[]`）⇒ **GREEN**：
- **控制组**：真面**按名拒**超配额的一票，且**配额内两票被接受**（证明拒绝来自那条边界，不是"一律拒"）；
- **三个单点变异**各改变可观测读数：①配额检查从不触发（无界发言者）②**off-by-one**（多放一票）③**回执错名**（`enforced.push('vmu.chat.speakQuota')` → 别的键，即"边界执行了但回执说谎"）；
- ★ **库的 `MUTATION-NOT-APPLIED` 当场抓到我自己的歧义锚点**（`if (limit > 0 && used >= limit)` 在 `send:329` 与 `maySpeak:562` **各一处**）⇒ 改为 `occurrences: 2`（两处一起变异才是真缺陷）。这正是"可证伪范式"的价值：它拦住了**我**的假变异。

---

## E · 命令与退出码（原样）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `node tests/vmu-chat-quota.mutants.mjs` | **0** | **GREEN**（控制组 2 条＋库自判 `ok`） |
| `node tests/vmu-meeting-parity.test.mjs` | **0** | 150/0（reader-c 的 F26/F31/F32/F34 断言，我复跑确认） |
| `node tests/vmu-tasks-dag-and-scopes.test.mjs` | **0** | 41/0（F35/F39 自证） |
| `node tests/vmu-resume-lock-and-marks.test.mjs` | **0** | 49/0（F51 跨进程 `generation===2`，我复跑确认） |
| `node tests/vmu-activity-timers.test.mjs` | **0** | 36/0（reader-b 的 F15 分类＋探针；**故意保留 §5 的 named-finding**） |
| `node scripts/check-docs.mjs` | **0** | `issues=0`（reader-b 写入 §11.ap 后，我复跑确认） |
| `node scripts/dsh-drive.mjs --port 7797 … --timeout 300 --max-tokens 40000 --follow-stream` | 0 | 回合完成；`tokenCap:40000, tokenCapHit:false`；total 31379 |
| `dsh --profile vmsmoke --patch … --port 7797 --no-open` | 0 | 起服务成功（stdout 给 token），跑完即停 |

## F · 交回 Lead

1. **多面点亮仍等 U14**（代码里还没有可声明 overlay／嵌套行寻址）⇒ 建议 Round 6：core 落地 overlay 后，我＋vmu-assistant **各 1 次**会话即可同时补齐"框架面 ≥3 面"与"助手面 5 条"的正面证据（我的 harness 已按 §2/§4 备好首行"模拟测试"标记与显式 `--max-tokens`）。
2. **F51 的唯一缺口**（`meetingOpen` 域标记）建议派给会议面；其余 F 项本轮已无明显空缺。
3. 本轮**未**改任何模块源码；改动集中在 `tests/**`、`package.json#files` 与三份 handoff（矩阵 v4／证据主表＋§10.6／本报告）。
