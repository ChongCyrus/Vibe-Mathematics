# vmu 交接 · Round 4 · task-30 报告（机制面：新键声明 · pack 文档最终口径 · maxParallel · docs）

- 任务：`task-30`（vmu-pack）；纪律：未跑全量 sweep、未跑 `regen-all`、未动 git；临时文件在 `D:\_tmp`；只改我名下文件（`kernel/bus.js`、`packs/**` 除 `packs/v5r/prompts/**`、`docs/05/06/10/27`）。
- **本轮我未改任何 settings 键的默认值**（原因见 A：Round 4 的键还没落/没有需要声明的）；改了两处：`kernel/bus.js` 一行登记 ＋ `docs/05/10/27`。

---

## A. 新键声明 · **截至我的收尾点，无可声明的新键**

- **实测**：`git diff --stat HEAD -- vibe-math-vmu/settings/schema.js` → **空**（HEAD = `d70a3ee` Round 3）⇒ **Round 4 尚无 settings 键落进 schema**；`grep 'ROUND 4|轮 4' schema.js` → 0 命中。
- **各面回复（已问，按纪律"读者未落地前不写默认值"）**：
  - **reader-a（F18/F51）：无新键**。F18 复用既有 `vmu.store.lock*`（`kernel/storepolicy.js:138-172` 的 `acquire/release`，我在 `createResume({lock})` 消费）；F51 的"重启标记"落在**既有耐久键 `resume`**（不是 settings）；`PROJECTION_KEYS` **无变化**（仍 10 面，`budget` 只是补了 `snapshot/restore` 能力）；唯一新增是**错误码** `VMU_RESUME_BUSY`（归 docs/03 §8，与 pack 默认值无关）。
  - **reader-b（F17）：无新键**。但**既有键 `vmu.math.captureStdoutBytes` 多了一个真读者**：`kernel/lean.js:67`（WIRED_KEYS）＋`:166`（`Number(readKey(...))`），与 `kernel/mathjobs.js` 共用同一含义。
  - **core（F9/F10/F11）、reader-c（F28）：截至收尾未回复/未落键** ⇒ 我**不预写**默认值；键与读者落地后我一行补（并跑 `D:\_tmp\vmu-pack-defaults-vs-schema.mjs` 核对）。
    - **reader-c 已答复（本报告收尾后到达，结论不变）**：**F28 不新增任何 settings 键**——会议侧界**复用既有 `vmu.meetings.hardLimitMs`**（真读取点 `kernel/meetings.js:336 lapseDue()`／`:348 lapse()`／`:370 revokeLapse()`）；表决侧界是**构造参数** `openMaxMs`（`kernel/ballotbox.js:82`，默认 0＝零机制）；新增的是 **action**（`extend/lapse/revokelapse/boxlapse/boxrevokelapse`），不是键。`tier/allowLight/reopenFloor` 语义与域**本轮未变**（我轮 3 的 v5r 默认值无需同步）。
- **三个"有读者但我不声明"的判定（具名说明，避免被当成遗漏）**：
  - `vmu.math.captureStdoutBytes`：**机制旋钮**（stdout 捕获上限，schema def `65536`，mathjobs/lean 共用常量），不是机构偏好 ⇒ pack **不声明**；部署可自行设。**不是"pack 默认值缺失"**。
  - `vmu.store.lock`：schema def `true` ＋ `storepolicy.js:95` 真读 ⇒ v5r 的"恢复即独占"**默认就成立**，无需 pack 声明（再写一遍＝第二份会漂移的副本）。
  - `vmu.meetings.speechExtendMs`（reader-c 本轮把既有键接上新命令 `extend`，`kernel/meetings.js:394`）：**故意不声明**——v5r 的会议**没有"延长"机制**（D4："只有有界、没有可延长"），schema def `0`＝零机制（请求延长 ⇒ 具名拒）**正是 v5r 的忠实语义**。
  - `vmu.ballot.openMaxMs`（reader-c 建议的未来键名，**尚无读者来自 settings**）⇒ 按纪律**本轮不写**；待 core 声明键且 `ballotbox` 真读后再补（reader-c 已把它登记进 `docs/08 §25.4` 的后续项）。

## B. pack 文档的**最终口径**（Lead 点名项）· **已写**

- `docs/10-packs.md` **新增 §4.1.1「面解析在 pack settings 之后」**：4 条编号规则（面解析在 pack settings 之后／清单声明即发布／`defaults.json` 只在"需要构造前可见"时用／**轮 3 的 `defaults.json` workaround 是缺陷 F1 的产物、已从根因修掉、不得再当规则**）。
- `docs/27-pack-folder.md` **新增 §4.4**（同口径，含机制引用与并发上限现状）。
- **代码依据（逐条可核）**：`vibe-math-vmu.js:365-371`（适配器拿的是 `kernel.settingsView()` 活视图）＋ `:636`（packs 之后重新 `install`）＋ `:682`（模块之后同样）＋ `:360-367` 的注释原文 **"No defaults.json workaround"**；面表在 `host.js:166-250`（`TOOL_FACES`：`families` × `config`）。
- **判断口径（写进文档，供 pack 作者用）**：读点在**构造期** ⇒ 值必须构造前可见（`defaults.json`／用户 config）；读点在**调用期**（H0/H1 热改） ⇒ **清单声明就够了**。

## C. `maxParallel` 收敛 · **未收敛，保留两行并注明**

- 复核：`kernel/mathtools.js:56,200,571-572` **仍读 `vmu.math.jobs.maxParallel`**（`evalKey(...)` ＋ `active >= K.maxParallel ⇒ VMU_RESOURCE_BUDGET`）；`kernel/mathjobs.js:41,249` 读 `vmu.math.maxParallel`。
- ⇒ pack **保留** `vmu.math.maxParallel=3` ＋ `vmu.math.jobs.maxParallel=1`，并在 `docs/10 §4.1.1 边界⑥` / `docs/27 §4.4` 写明"待 core 让 `mathtools` 改读前者后删掉后者一行"；已通知 core。

## D. 文档同步 · **已落**

| 卷 | 改了什么 |
|---|---|
| `docs/05-middleware.md` | **新增 §5.4「三类名字的边界：登记钩子 / 声明主题 / 仅日志」**（表格 ＋ 两个探针 ＋ 22 个未登记 `bus.emit` 名清单 ＋ `workflow/*` 特例 ＋ 待裁决）；本轮**零**钩子语义变更以外的改动 |
| `docs/10-packs.md` | §4.1.1（最终口径）＋ 边界⑥（并发收敛未完成） |
| `docs/27-pack-folder.md` | §4.4（最终口径 ＋ 并发现状）；pack 文件清单仍被 `audit-pack-face` 点名通过（5/0） |
| `docs/06-prompt-pipeline.md` | **未改**（本轮零提示词管线改动） |

## E. 顺带修掉的一条**活 bug**（在我文件里，一行）

- `kernel/resume.js:749` 经 `:306-312` 的 NAME-first helper `emit('resume/lock-release-failed', …)` 发事件，但该名字**未登记**且 `resume/` 在 `VU_NAMESPACE` 内 ⇒ **总线抛 `VMU_INVALID_ARGUMENT`，被 helper 的 `catch` 吞掉** ⇒ 每次释放锁失败都**静默丢失**（与轮 496 的 `budget/warn`／`member/self-report` 同类）。
- **证据**：`node tests/audit-hook-coverage.test.mjs` 在该 emit 落地后立刻红（`unfrozen:["resume/lock-release-failed (kernel/resume.js)"]`）。
- **修法**：`kernel/bus.js` 登记一行（`failure:'open'`，observation，producer `kernel/resume.js`）⇒ `VU_HOOKS` **55→56**、`hookRegistryProblems()` `[]`、`audit-hook-coverage` **4/0 exit 0**。已通知 reader-a（其代码无需改），并给出规则：这些命名空间里**未登记的名字 emit 会具名拒**。

---

## 验证（原样命令 + 退出码；单跑，非全量）

工作目录 `Vibe-Mathematics`。

| 命令 | 退出码 | 结果 |
|---|---|---|
| `node D:\_tmp\vmu-pack-defaults-vs-schema.mjs` | 0 | `undeclared=0`（pack defaults 键全在 schema；另如实打印 v3-core 的 5 个 `vmu.v3.*` 包私有键未在 schema，非本轮引入） |
| `node D:\_tmp\vmu-topic-vs-registry.mjs` | 0 | `declareTopic` 后 `bus.emit` 成功、`isRegisteredHook` **仍 false**（M2 模块挂不上声明主题）；`workflow/advance` 前缀放行 |
| `node D:\_tmp\vmu-hook-emit-census.mjs` | 0 | 85 emit 名 / 22 个未登记 `bus.emit` 名 / 9 个仅日志；`registered-but-never-emitted=0` |
| `node tests/audit-hook-coverage.test.mjs` | 0 | **4 passed, 0 failed**（登记 `resume/lock-release-failed` 后转绿） |
| `node tests/audit-pack-face.test.mjs` | 0 | 5 passed, 0 failed |
| `node tests/vmu-pack.test.mjs` | 0 | 53 passed, 0 failed |
| `node tests/vmu-resume-recovery.test.mjs` | 0 | 73 passed, 0 failed |
| `node tests/audit-vmu-release.test.mjs` | 0 | 22 passed, 0 failed |
| `node tests/audit-doc-vs-code-tables.test.mjs` | 0 | 17 passed, 0 failed |
| `node tests/audit-claim-traceability.test.mjs` | 0 | 5 passed, 0 failed |
| `node tests/audit-doc-api-coverage.test.mjs` | 0 | 2 passed, 0 failed |

**非我红（已通知 owner）**：
- `tests/vmu-kernel.test.mjs` **exit 1**：`and it reads EXACTLY those (8 Lean + 4 jobs) with no duplicate [13 keys]` —— reader-b 的 F17 让 `kernel/lean.js:67,166` 多读 `vmu.math.captureStdoutBytes`，期望集合（`LEAN_KEYS + JOBS_KEYS` = 12）没跟上 ⇒ 已请 vmu-verify 把该键加进期望集合并**保留"无重复"断言**（勿再写死数字）。
- 轮 3 归口的三条（`vmu-entry` 竞态 / docs/03 服务实数 / 生成块 stale）按 Lead 分工，我不跟进。

## 未做 / 待裁决

1. **Round 4 新键**：core（F9/F10/F11）的键尚未落地 ⇒ 我**不预写**；落地后我一行补并复跑探针（读者未落地前不写，Round 3 的 C-30 教训）。
2. **`maxParallel` 收敛**：core 完成后通知我，我删 `vmu.math.jobs.maxParallel` 一行。
3. ~~22 个未登记名 / `declareTopic` 非对称~~ ⇒ **已按 Lead 裁决执行，见 F**。

---

## F. 裁决执行（Lead ①②，Round 4 收尾）· **已完成**

### ① 30 个"`bus.emit` 但未登记"的名字：**逐个分类，二选一，无中间态**

**登记为钩子（24 个）** —— 行为已发生、扩展方应当能反应；`kernel/bus.js` 的 `HOOK_REGISTRY` 各一行（`failure:'open'`，post-hoc 通知，不可阻断），并把 12 个命名空间加进 `VU_NAMESPACE`：
`paper/office-consult-required`；`publication/{advance,replication-failed}`；`notify/emit`；`crypto/{signed,rotated}`；`external/stale-served`；`legalentity/registered`；`ratelimit/{queued,degraded}`；`recruit/confirmed`；`reviewers/registered`；`workflow/{advance,retry,escalate}`；`formal/{checked,fidelity-defect,abstention-enforced,defects-loaded}`；`lean/{job-submitted,job-settled,job-timeout,job-recovered,jobs-disposed}`。
（`formal/*`、`lean/*` 先前被我误判为"本地日志"：实测 `kernel/formal.js:49-52`、`kernel/lean.js:134-137`、`kernel/fidelity.js:49-52` 的 helper **确实调用 `bus.emit(String(name), …)`** ⇒ 它们是真的总线 emit，已按事件登记。）

**显式 log-only（6 个）** —— 只是账目/审计行，**不应**可订阅；`kernel/bus.js` 新增 **`LOG_ONLY_EMITS`**（名字→理由，理由 <20 字符会被门禁拒）：`audit/rotate`、`auditchain/{appended,checkpoint-failed,partial-verify,anchored}`、`retention/truncated`。
`audit|auditchain|retention` **故意不加进 `VU_NAMESPACE`**：它们不是钩子，直通即其语义（加了反而会让账目行 emit 具名拒）。

**门禁升级**：`D:\_tmp\vmu-hook-emit-census.mjs`（仓库外临时探针·实测）现在三段并 exit 非 0：① **每个 emit 名必须已分类**（登记 ∪ log-only；`unclassified` 必须 0）② 每个登记钩子必须有 emit 点 ③ `declareTopic` 两向对称。当前 **PASS**（`emitted=86 registered=100 logOnly=6 unclassified=0`；`registered vmu hooks=80 without an emit site=0`）。

### ② `declareTopic` 统一：**声明即可被 M2 订阅**（正反两向断言）

- `kernel/bus.js`：新增进程级 `DECLARED_TOPICS` ＋ 导出 `declaredTopics()`／`isDeclaredTopic(name)`；`declareTopic()` 在加入 `customTopics` 的同时加入该集合。
- `kernel/loader.js`：`isRegisteredHook()` 现在 `VU_HOOKS ∪ DSH_HOOKS ∪ HOOK_PREFIXES ∪ isDeclaredTopic()`。
- **正向**：`declareTopic('lab/review-requested')` ⇒ `isRegisteredHook(...)` 由 `false` 变 **`true`**；**反向**：未声明/拼错名仍 `false`，且 vmu 命名空间内未登记名 `bus.emit` 仍抛 `VMU_INVALID_ARGUMENT`（门禁 §3 断言两者）。

### 附带（Lead 追加）

- **门禁工具已进仓（D-05）**：`scripts/audit-hook-emit-classification.mjs`（**仓内**，干净 clone 可复现），并按 D-05 修订口径进 `package.json` 的 `files[]`（`scripts/**` 只登记 files[]）；**仓库外那两份临时副本已删除**（`vmu-hook-emit-census.mjs`、`vmu-topic-vs-registry.mjs`）。★ **进仓门禁当场多抓出 5 个未分类名**：`board/moved`、`projmigrate/migrated`、`skills/declare`、`topology/select`、`trust/signal`（都是**字符串形态** `bus.emit('…')`，只是注释自称 "advisory"，此前既没登记也没分类）⇒ 已一并登记为钩子（`VU_HOOKS` **85**），5 个命名空间加入 `VU_NAMESPACE`。
- **D9**：`docs/05 §5.4` 重写时把探针路径标注为 **"仓库外临时探针·实测"**，并把权威门禁改指**仓内**脚本 ⇒ `node scripts/check-docs.mjs` **PASS，issues=0**（未删证据路径）。
- **"先登记再 emit"**：本轮新增的 **29** 个名字**全部先登记**；`resume/lock-release-failed`（轮 3 收尾那条）已登记。后续任何新 emit 名若落在 `VU_NAMESPACE` 内而未登记 ⇒ **具名拒**（仓内门禁 §1 也会红）。
- **`docs/10 §4.1` 边界⑦⑧⑨⑩**：为三个"有读者但故意不声明"的键各留一行具名理由（`captureStdoutBytes`／`store.lock`／`speechExtendMs`）＋ `vmu.ballot.openMaxMs` 的"读者未落地不预写"。
- **并发上限（Lead 裁决 2）已执行**：删掉 `vmu.math.jobs.maxParallel` 的 pack 行（该行已被入口镜像**覆盖**＝声明无效果）；`docs/10 §4.1`＋`docs/27 §4.4` 改写成"**行为层已收敛（入口镜像，`vibe-math-vmu.js:289-305`）；读点清理待 reader-b；pack 不再重复声明**"。**遗留语义问题见 §G**。
- **更正 Lead 的一条清单（我复核后）**：Lead 点名的 5 处（`board.js:130`、`projmigrate.js:112`、`skills.js:114`、`topology.js:172`、`trust.js:178`）**不是对象字面量**——实测它们是 `bus.emit('board/moved', …)` 这类**字符串形态**调用（只是名字未分类）；对象字面量/变量首参的是另一批（见 §H）。这 5 个已按"真事件"登记。

### 追加验证（原样命令 + 退出码）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `node scripts/audit-hook-emit-classification.mjs` | 0 | **HOOK EMIT CLASSIFICATION: 7 passed, 0 failed**（§1 分类／§2 无纸面能力／§3 对称） |
| `node D:\_tmp\vmu-pack-defaults-vs-schema.mjs`（仓库外一次性探针·实测） | 0 | `packs-with-defaults checked; undeclared=0` |
| `node scripts/check-docs.mjs` | 0 | `vmu doc-lint: docs=29 issues=0` / **DOC LINT: PASS**（D9 已消） |
| `node tests/vmu-pack.test.mjs` | 0 | 53 passed, 0 failed |
| `node tests/audit-hook-coverage.test.mjs` | 0 | 4 passed, 0 failed（**85** 个登记钩子 ⇄ emit 点；放大后的 `VU_NAMESPACE` 内无未冻结 emit） |
| `node tests/vmu-bus.test.mjs` | 0 | 44 passed, 0 failed |
| `node tests/vmu-loader.test.mjs` | 0 | 28 passed, 0 failed |
| `node tests/vmu-host-hooks.test.mjs` | 0 | 22 passed, 0 failed |
| `node tests/vmu-kernel.test.mjs` | 0 | 175 passed, 0 failed（vmu-verify 已修 13 键断言） |
| `node tests/vmu-host.test.mjs` | 0 | 103 passed, 0 failed |
| `node tests/vmu-entry.test.mjs` | 0 | 150 passed, 0 failed（竞态已由 vmu-verify 修） |
| `node tests/vmu-pack.test.mjs` | 0 | 53 passed, 0 failed |
| `node tests/audit-doc-api-coverage.test.mjs` | 0 | 2 passed, 0 failed |
| `node tests/audit-vmu-release.test.mjs` | 0 | 22 passed, 0 failed |
| `node tests/audit-doc-vs-code-tables.test.mjs` | 0 | 17 passed, 0 failed |
| `node tests/audit-pack-face.test.mjs` | 0 | 5 passed, 0 failed |

### §G. 并发参数：**已裁决并落地（两个策略各归其名）**

- **裁决（Lead）**：**不要镜像成一个值**——两个策略必须各归其名。
  - `vmu.math.maxParallel` ＝ **1**（数学作业/编译并发；与 v5r 的 `leanJobsMaxParallel: 1`＝后台编译串行一致；两个读者 `kernel/mathjobs.js:41,249` 与 `kernel/mathtools.js:56,200,571-572` 都是**数学运行**的并发）。
  - `vmu.limits.maxLiveMembers` ＝ **3**（成员唤醒并发；v5r 的 `maxParallel: 3` 原义；读者 `kernel/index.js:221` 的 `liveMemberCapOf` ⇒ `declareSlots`）。
  - 旧名（`math.jobs.maxParallel`）：core **已从 schema 移除**（`schema.js:989-993` 的注释），pack **不声明**；`kernel/mathtools.js` 仍读它 ⇒ **读点退役归 reader-b**（退役前 docs/04 报"已接线但未声明"）。
- **我落地的**：`packs/v5r/settings/defaults.{json,js}` → `vmu.math.maxParallel: 1` ＋ `vmu.limits.maxLiveMembers: 3`（**34 键，JSON/JS 同值**；旧名不出现）；`docs/10 §4.1` 行 ＋ 边界⑥、`docs/27 §4.4` 全部改写成"两个策略各归其名"。
- **读数**：`node D:\_tmp\vmu-pack-defaults-vs-schema.mjs` → **exit 0 / `undeclared=0`**；`vmu-pack` 53/0；`vmu-kernel` 175/0；`vmu-host` 103/0；`vmu-members` 39/0；`vmu-entry` 150/0。

### §H. 关于"5 处对象字面量"的**时点差异**（Lead 要求写清，避免下轮误读为互相矛盾）

- **两条观察都对，只是时点不同**：Lead 复核时（当时状态）`kernel/board.js:130`、`projmigrate.js:112`、`skills.js:114`、`topology.js:172`、`trust.js:178` 确实是 `bus.emit({ type: '…' })` **对象字面量**；**core 在 20:02 已把它们改成字符串形态** ⇒ 我随后实测看到的是 `bus.emit('board/moved', …)`。
- **我的仓内新门禁**（`scripts/audit-hook-emit-classification.mjs`）正是在这个时点**抓出 5 个"未分类名"**（名字当时既不在 `HOOK_REGISTRY`、也不在 `LOG_ONLY_EMITS`）并已登记为钩子——**这 5 个名字的登记是正确的**，与"首参形态"是两件事。
- 真正"变量首参"的 helper（`kernel/alerts.js:109`、`bidding.js:98`、`capacity.js:88`、`conference.js:88`、`course.js:80`、`funding.js:92`、`governance.js:47`、`grant.js:54` 等，`bus.emit(event)`）**不一定**是缺陷；按 Lead 分工，"对象首参"门禁归 vmu-verify，**我不再跟进**。

### §I. 收尾复跑撞到的两条**非我红**（已通知 owner）

1. **`tests/vmu-planned-settings.test.mjs` RED**：core 按裁决把 `vmu.math.jobs.maxParallel` 从 schema 移除后，**docs/04（core）、docs/09 与 docs/15（reader-b）仍出现该字面量** ⇒ 门禁报"documented vmu.* name left unregistered"，并连带 `settings/planned.js` stale（114 vs 113）。**我的 docs/10、docs/27 已清干净**（改成不带 `vmu.` 前缀的"旧名（`math.jobs.maxParallel`，已从 schema 移除）"）；已分别通知 core 与 reader-b（**无需**跑生成器写盘，清掉字面量后 `--check` 自动 clean）。
2. **`tests/vmu-round1-seams.test.mjs` RED（1/38）**：`FAIL deliverViaSubagents returns the host reply` —— vmu-core 的 Round 4 F9/F11 把 `kernel/turn/index.js:144` 的 `deliverViaSubagents` 改成返回**对象** `{ reply, childId, stopReason, attribution }`（见 `:161-171` 与 `:205` 的注释），而测试 `:192-194` 仍断言 `typeof reply === 'string'` ⇒ **实现改了、断言没跟**。已通知 vmu-verify（tests 归它）与 vmu-core（实现归它）。**与本轮 pack/bus/loader 改动无关**（该套件在本次收尾前一轮为 38/0）。
