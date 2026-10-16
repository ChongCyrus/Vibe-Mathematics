#!/usr/bin/env node
// vmu · E5 零机制行为矩阵（生成式）—— 回答"**零配置下该期待什么**"（第 12 轮 C4 遗留 ✓）。
//
// 用法：
//   node scripts/generate-zero-mechanism-matrix.mjs            # 打印矩阵（人看）
//   node scripts/generate-zero-mechanism-matrix.mjs --check     # 与 11 卷里的生成块比对；**漂移即红** ✗✓
//   node scripts/generate-zero-mechanism-matrix.mjs --write     # 把矩阵写回 11 卷的生成块（标记内 ✓）
//
// 原则（Lead 口径 ✓）：
//   · **只读**：以 `create({clock})`（**不传 settings** ✗）创建每个内核模块，调用一个代表性操作，采集
//     "**返回/拒绝形状 ＋ 自曝字段**" ✓ —— **绝不改任何模块语义** ✗✓；
//   · 列＝`模块 | 零机制下的返回形状 | 是否具名拒（码） | 自曝字段 | 期望（设计）` ✓；
//   · **"期望"与"实测"不一致 ⇒ 门禁红** ✗✓（要么修模块，要么在 EXPECT 里明写"设计如此"＋理由 ✓；
//     **不许为了让矩阵好看而改模块** ✗✓ —— 本脚本**无权改模块** ✓）；
//   · 已知四形态（期望值来源 ✓）：`idempotency`＝显式 `absent` ✓／`mathtools`＝`ok + enforced:[]` ✓／
//     `meetings`＝按声明**默认开成** ✓／`records`·`ballotbox`＝**具名拒或 ok** ✓。

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const KERNEL = join(HERE, '..', 'vibe-math-vmu', 'kernel')
const DOC = join(HERE, '..', 'vibe-math-vmu', 'docs', '11-gates-and-development.md')
const BEGIN = '<!-- BEGIN GENERATED: zero-mechanism-matrix -->'
const END = '<!-- END GENERATED: zero-mechanism-matrix -->'

/** 期望（设计）表：`模块 → {shape, note}` ✓；**未登记 ⇒ 显式标"设计未定"** ✗✓（不算漂移，但计数 ✓）。 */
/** 期望（设计）表 ✓（**逐条、一行理由** ✓ —— 从各模块的实际契约反推 ✓）。
 *  三种登记值：形状 ✓／`EXPECT_UNDECIDED`（**显式待办**，不红但计数 ✓）／`EXPECT_NA`（非服务模块 ✓）。 */
const G = (shape, note) => ({ shape, note })
const OK_READ = G('ok 或 object', '状态/列表面：无声明 ⇒ 放行（不拒）')
const REFUSE = G('具名拒（带 code）', '缺必填参数 ⇒ 具名拒并点名')
const EXPECT = {
  // ── 状态/列表/只读面：零机制＝宽松放行 ✓（26）
  alerts: OK_READ, audit: OK_READ, auditchain: OK_READ, ballot: OK_READ, bidding: OK_READ,
  board: OK_READ, bus: OK_READ, clockguard: G('ok 或 null', '时钟守卫：无声明 ⇒ 不拦（返回 null 亦合规）'),
  crypto: OK_READ, domaingate: OK_READ, external: OK_READ, fairness: OK_READ, index: OK_READ,
  loader: OK_READ, meeting: OK_READ, members: OK_READ, metrics: OK_READ, minutes: OK_READ,
  // ROUND 12 / task-95 (vmu-core's finding): the two modules split out in R10/R11 appeared with `op 抛出` and NO
  // verdict row - and the throw-skip below ran BEFORE the "no row ⇒ red" check, so they were counted as probe
  // errors and never named (the matrix printed "设计未定 ✗" while `--check` said `0 unregistered`). Their real
  // exports are `createMeetingControls` / `createLeaveControls` (the matrix's `lapseDue()` / `requestLeave()` are
  // operations that need arguments - measured: the factory builds, the op throws without them) ⇒ the honest shape
  // is PROBE_NEEDS_ARGS, i.e. "the probe cannot call this without arguments", NOT "no verdict needed".
  meetingleave: G('PROBE_NEEDS_ARGS', 'R12 拆出（`createLeaveControls`）；`requestLeave()` 缺参数即抛 ⇒ 探针需要参数才能裁定（登记为待补参数，而不是"无需裁定"）'),
  meetinglapse: G('PROBE_NEEDS_ARGS', 'R12 拆出（`createMeetingControls`）；`lapseDue()` 缺参数即抛 ⇒ 探针需要参数才能裁定（同上）'),
  // ROUND 12 / task-95 · THE THIRD INSTANCE, caught BY the reorder above within one minute of applying it:
  // `kernel/resumeflush.js` (split out in R10, 150 lines, `createExitContract`) had NO verdict row and a THROWING
  // probe ⇒ it was invisible for two rounds (`0 unregistered`). Measured: `createExitContract({})` throws
  // "createExitContract needs a snapshot({key}) writer" - the factory needs its seam injected ⇒ PROBE_NEEDS_ARGS.
  // This is the self-proof the fix was required to carry: an unregistered + throwing module now REDS, and this one
  // did - found in the wild rather than planted.
  resumeflush: G('PROBE_NEEDS_ARGS', 'R10 拆出（`createExitContract`）；实测 `createExitContract({})` 抛 "needs a snapshot({key}) writer" ⇒ 工厂需要注入接缝，探针需参数才能裁定（由 R12 的顺序修正当场抓出）'),
  notify: OK_READ, projmigrate: OK_READ, ratelimit: OK_READ, recruit: OK_READ, registry: OK_READ,
  replay: OK_READ, retention: OK_READ, rules: OK_READ, scheduler: OK_READ, skills: OK_READ,
  tasks: G('array', '任务板：零机制 ⇒ 空列表（放行）'), topology: OK_READ, trust: OK_READ,
  governance: G('array 或 object', '治理面：只读列举（keysUsed/partition 不拒）'),
  // ── 具名拒面：缺参数/未声明 ⇒ 具名拒 ✓
  ballotbox: G('具名拒或 ok', 'task-214 实测：`open()` ⇒ 具名拒 **VMU_CONFLICT**（带口径 `enforced=[0]`）⇒ 零机制＝无票面参数 ⇒ 具名拒；有默认 ⇒ ok ✓'),
  course: G('具名拒或 ok', 'task-214 实测：`open()` ⇒ 具名拒 **VMU_INVALID_ARGUMENT**（带口径 `enforced=[1]`）⇒ 零机制＝缺课程参数 ⇒ 具名拒 ✓'),
  formal: G('具名拒（带 code）', 'task-214 实测：`check()` ⇒ 具名拒 **VMU_MATH_INVALID_INPUT** ⇒ 零机制＝无形式化请求 ⇒ 具名拒即真实形状 ✓'), mathjobs: G('ok 或 object', '**两侧都写清** ✓（★ 轮 4 更正读数 ✗✓）：**状态/列表面 `list()` ⇒ `{ok:true,count:0,dropped:0,jobs:[]}`（object 信封；零机制＝无作业 ⇒ 空列表放行 ✓）**；`submit()` 缺参 ⇒ 具名拒 **VMU_MATH_INVALID_INPUT**（task-214 实测，保留 ✓）。★★ 为什么改：轮 2 这行写"`list()` ⇒ array[0]"，而**当时探针没有固定 op**（`mathjobs` 同时有 `submit`/`list`，谁先匹配谁被调）⇒ 那个形状可能来自另一个方法、也可能是模块自身的形状变化 ✗ ⇒ 本轮**固定探针 op＝`list`**（见 `PROBE_ARGS.mathjobs`）后按**实测**改写；`submit` 的具名拒仍由既有 task-214 断言守着 ✓'), lean: G('具名拒（带 code）', 'task-214 实测：`submit()` ⇒ 具名拒 **VMU_LEAN_STATEMENT_REQUIRED** ⇒ 零机制＝无命题文本 ⇒ 具名拒即真实形状 ✓'), lifecycle: G('具名拒（带 code）', 'task-214 实测：`stages()` ⇒ 具名拒 **VMU_LIFECYCLE_NOT_DECLARED** ⇒ 零机制＝未声明生命周期 ⇒ 具名拒即真实形状 ✓'), stateversion: G('具名拒（带 code）', 'task-214 实测：`check()` ⇒ 具名拒 **VMU_COMPAT_UNKNOWN_COMBO** ⇒ 零机制＝无版本声明 ⇒ 具名拒即真实形状 ✓'), repropack: G('具名拒（带 code）', 'task-214 实测：`build()` ⇒ 具名拒 **VMU_MATH_SEED_REQUIRED** ⇒ 零机制＝无复现种子 ⇒ 具名拒即真实形状 ✓'),
  idempotency: G('ok 或 object', '列表/状态面放行 ✓；**显式 `absent` 只在去重操作上**（该操作需参数 ⇒ 探针见 NEEDS_ARGS ✓）'),
  meetings: G('按声明默认开成', '零机制＝按声明默认值开成（不拒）✓'),
  // ── 探针缺参（**显式登记**，不算 mismatch ✓）：需显式探针或补参数
  arbitration: G('具名拒或 ok', 'task-214 批 3 补参（形状取自测试 vmu-arbitration.test.mjs:261 `open({parties,subject})`）：补参前实测具名拒 **VMU_ARBITRATION_OFF**（带口径 `enforcedScope=evaluated-so-far`）⇒ 若补参后仍拒，则"具名拒即零机制真实形状"✓；若放行 ⇒ 亦合规 ✓'),
  budget: G('ok 或 object', 'task-204 实测（形状取自测试 vmu-budget.test.mjs:16）：不传 settings 下 `open({scope})` ⇒ **ok**（零机制＝不限额、放行 ✓）'), charter: G('具名拒或 ok', 'task-214 批 3 补参（形状取自测试 vmu-charter.test.mjs:236 `propose({kind:"charter",text,by,articles:[{id}]})`）：补参前实测具名拒 **VMU_CHARTER_NOT_AUTHORIZED** ⇒ 补参后若放行 ⇒ ok ✓；若仍具名拒 ⇒ 写明"缺参即其零机制形状" ✓'),
  delegation: G('具名拒或 ok', 'task-214 批 3 补参（形状取自测试 vmu-delegation.test.mjs:30 `check({actor,action})`）：补参前实测具名拒 **VMU_INVALID_ARGUMENT**（带口径 `enforcedScope=evaluated-so-far`）⇒ 补参后应见判定对象（放行）⇒ 已放宽为"具名拒或 ok" ✓'), handover: G('具名拒或 ok', 'task-214 批 3 补参（形状取自测试 vmu-handover.test.mjs:27 `open({from,to})`）：补参前实测具名拒 **VMU_INVALID_ARGUMENT** ⇒ 补参后应见放行 ⇒ 已放宽为"具名拒或 ok" ✓'),
  library: G('PROBE_NEEDS_ARGS', '缺：库引用（ref/uri）'), math: G('PROBE_NEEDS_ARGS', '缺：数学请求体'),
  mathtools: G('具名拒（带 code）', 'task-214 实测：`plan()` ⇒ 具名拒 **VMU_MATH_INVALID_INPUT**（带口径 `enforced=[0] enforcedScope=evaluated-so-far`）⇒ 零机制＝无计划入参 ⇒ 具名拒即真实形状 ✓（补参后应见 `ok + enforced:[]`，届时改"具名拒或 ok" ✓）'),
  memory: G('ok 或 object', 'task-204 实测（形状取自测试 vmu-memory.test.mjs:63）：`record({kind,text,by,evidence})` ⇒ **ok**（零机制＝有默认 scope、放行 ✓）'), publication: G('具名拒（带 code）', 'task-214 实测：`advance()` ⇒ 具名拒 **VMU_VERSION_CHAIN_BROKEN** ⇒ 零机制＝无版本链可推进 ⇒ 具名拒即真实形状 ✓'),
  records: G('ok 或 object', 'task-204 实测（形状取自测试 vmu-records.test.mjs:103）：`put({track,kind,title,body,settled:true})` ⇒ **ok**（零机制＝无配额限制、放行 ✓）'),
  store: G('PROBE_NEEDS_ARGS', '缺：存储配置'), transaction: G('ok 或 object', 'task-204 实测（形状取自测试 vmu-transaction.test.mjs:62）：`begin({id,steps:[{service,apply,undo}]})` ⇒ **ok**（零机制＝无预算门、放行 ✓）'),
  work: G('PROBE_NEEDS_ARGS', '缺：工作项'),
  // ── 轮 135：多成员合著面（paper.js）✓
  // 零机制形状：**开篇不需要任何设置**（`vmu.paper.*` 只影响"定稿闸"与"谁可定稿"）⇒ 无参 `start()` 具名拒
  // （缺 title／sections／**无主章节**／editor），带参则 ok ⇒ 与 course/delegation 同族，登记为"具名拒或 ok" ✓。
  paper: G('具名拒或 ok', '轮 135 实测：`start()` 无参 ⇒ 具名拒 **VMU_INVALID_ARGUMENT**（缺标题／章节／**无主章节**／编辑 ✓ —— 缺参即其零机制真实形状 ✓）；`PROBE_ARGS.paper` 带参后应见 **ok**（开篇不需要任何设置 ✓）⇒ 两态皆合规 ✓'),
  workflow: G('具名拒或 ok', '**两侧都写清** ✓：`define({})` / `stages()` ⇒ 零机制**放行（ok）** ✓；被探 `advance()` 缺参 ⇒ **task-214 实测：具名拒 `VMU_WORKFLOW_TRANSITION_REQUIRED`（带口径 `enforced=[7]`）** ⇒ 具名拒即真实形状 ✓（旧 note 曾写 `op 抛出` ✗ / "缺参 ⇒ 具名拒" 混述 ✗，均已按实测改写 ✓）'),
  // ── 第 26 轮已修好的具名拒（**待办没跟上 ⇒ 已纠正** ✓）＋ 非服务模块
  pack: G('具名拒（带 code）', '第 26 轮已修 ✓：实测拒绝带 **`VMU_PACK_MISSING`**（曾误标"不带 code" ✗）'),
  'script-bridge': G('具名拒（带 code）', '第 26 轮已修 ✓：实测拒绝带 **`VMU_INVALID_ARGUMENT`**（同上 ✗）'),
  // ── 在途新模块：**必须被裁定** ✓（第 33 轮规则收紧 ✓）—— 从模块实测反推 ✓
  resource: G('ok 或 object', '仪器面：零机制 ⇒ **台账可读、不拒**（`status()` 返回 `ok:true` ＋ `partition` ✓）；**键数由本生成器实测输出** ✓（note 只写形状与理由 ✗）'),
  // **按实测升级为真期望**（第 34 轮 ✓；零机制**不传 settings** 实测 ✓，**不编造** ✗）
  conference: G('ok 或 object', '实测 `open()` ⇒ **ok**（`enforced=[2] fired=[2]` ⇒ 零机制**按默认阶梯开成、放行** ✓，与 `meetings` 同口径 ✓）'),
  ip: G('ok 或 object', '实测 `list()` ⇒ **ok**（`enforced=[1] fired=[0] dropped=0` ⇒ 清单可读、**不拒** ✓）'),
  // Round 32 (continued). storepolicy's expectation is MEASURED, not guessed: status() answers ok:true with its
  // policy (backend/rooted/durable/remote/onVersionTooHigh), while a real write with no root returns a NAMED
  // refusal carrying vmU.store.root and the scope field. compliance and funding never reached the matrix as
  // unadjudicated because their probes need arguments, so they are counted under PROBE_NEEDS_ARGS, not decided
  // here by invention.
  storepolicy: G('ok 或 object', '零机制 `status()` 实测 **ok**，自曝 `enforced=[0] fired=[0] enforcedScope=evaluated-so-far` ⇒ 策略面**可读、不拒** ✓；**本行探针之外另测**：真实 `write()` 缺 root ⇒ **返回型具名拒** `VMU_INVALID_ARGUMENT` 并列 `vmu.store.root` ✓（**键数由本生成器实测输出** ✓）—— 旧 note 曾写"status 带 backend/rooted/durable/remote" ✗，与实测不符，已按实测改写 ✓'),
  // These two landed while this round was in flight and their probes DID reach the matrix, so the "appears without
  // an adjudication" rule flags them one at a time. They are registered as EXPLICIT to-dos with what is already
  // known, rather than given expectations nobody measured - "undecided" is visible and counted, "missing" is not.
  funding: G('ok 或 object', '实测 `list()` ⇒ **ok**（`enforced=[0] fired=[0]` ⇒ 零机制清单可读、**不拒**；**键数由本生成器实测输出** ✓）'),
  compliance: G('ok 或 object', '实测 `status()` ⇒ **ok**（`enforcedScope=evaluated-so-far` ⇒ 状态可读、**不拒**）。**ROUND 153 更正** ✗✓：本行原先还写"`exportControlCheck` 归 domaingate ✓" —— **实测 `domaingate` 并没有该检查** ✓（`grep export|control` 只命中 `apiVersion` 与注释 ✓），那是**愿望**不是**承载者** ✗；该能力是**全仓缺口** ✓，归属面与复活条件写在 `compliance.js` 的 `PLANNED_REASONS` 里 ✓'),
  // Round 35: capacity / hr landed while this round was in flight and their probes DID reach the matrix (both
  // answered), so they are adjudicated from the MEASUREMENT above, not from invention:
  //   capacity · list()  ⇒ ok, enforced=[0] fired=[0] enforcedScope=evaluated-so-far
  //   hr       · status() ⇒ ok, enforcedScope=evaluated-so-far
  capacity: G('ok 或 object', '实测 `list()` ⇒ **ok**（`enforced=[0] fired=[0] enforcedScope=evaluated-so-far` ⇒ 零机制**清单可读、不拒** ✓；**键数由本生成器实测输出** ✓）'),
  tenure: G('ok 或 object', '实测 `status()` ⇒ **ok**（`enforcedScope=evaluated-so-far` ⇒ 零机制**状态可读、不拒** ✓；**键数由本生成器实测输出**、**零新码** ✓）'),
  // Round 34/35: the migration face landed at the end of the round. Its probe needs a plan payload
  // (from/to/backend/steps) that the automatic op choice cannot invent, so it is registered as an explicit
  // to-do rather than given an invented expectation - the batch that fills probe arguments will upgrade it.
  migration: G('PROBE_NEEDS_ARGS', '缺：迁移计划入参（`from`／`to`／`backend`／`steps` ✓）；**作者已导出带完整 args 的 `GATE_SCENARIOS`** ⇒ 下一批补参时应可直接实测 ✓（**键数由本生成器实测输出**、**零新码**、全部返回型拒绝 ✓）'),
  // ROUND 224: a new face must be RULED, and the rule must be MEASURED. `identity` discloses
  // `noIssuerListMeansNoCheck` (an empty issuer list means no issuer check at all), which is a zero-mechanism claim, so the
  // matrix demanded a row. Measured with no declarations: status().ok === true (it does not refuse) and bindPrincipal()
  // answers ok with binding 'off'. No ASCII quote appears anywhere in this fragment: that trap has now cost five scripts.
  identity: G('ok 或 object', '实测（轮 224）：零声明下 status() ⇒ **ok**（noIssuerListMeansNoCheck: true 自曝「空 issuer 列表＝完全不做校验」 ✓）；bindPrincipal ⇒ ok 且 binding: off（记录而不耦合 ✓）。**不拒** ⇒ 形状为 ok，而非具名拒 ✓'),
  // ROUND 224: the faces added since round 218 are ruled here, each with its zero-mechanism shape MEASURED (the generator's
  // own rule: an expectation must be measured, never guessed). Each returns status().ok === true with nothing declared - it
  // reports rather than refusing - which is the same shape `compliance` was measured to have. No ASCII quote appears in this
  // fragment: nesting quotes inside a quoted string has now cost five scripts.
  collab: G('ok 或 object', '实测（轮 224）：零声明下 status() ⇒ ok（counterparties: 0、agreements: 0 自曝 ✓）；agreementRequired 默认 true 但无对手方⇒无可交换对象，**不拒** ✓'),
  human: G('array 或 object', '两侧都写清 ✓：**零声明下 `status()` ⇒ ok（object）**（vetoes: 0、approvals: 0 ✓；neverAllowsBySilence: true 自曝「onTimeout 默认 hold ⇒ 沉默绝不变成批准」 ✓，轮 224 实测）；**Round 3 新增 `queue()` ⇒ 零机制下返回 `array[0]`**（审批队列为空正是零机制的正确形状 ⇒ **空列表放行、不拒** ✓，与 `mathjobs.list()` 同判据）。★ 判据＝**列表面可读、不拒**；"队列为空"**不得**被读成"门已生效"（门由 `gate()` 的具名拒证明 ✓）'),
  discipline: G('ok 或 object', '实测（轮 224）：零声明下 status() ⇒ ok（subjects: 0；breakerOffMeansOff: true 自曝「阈值 0＝机制关，而非允许零次失败」 ✓）'),
  activity: G('ok 或 object', '**先实测后登记**（Round 3 探针）：零声明下 `status()` ⇒ **ok（object）**——等待器数为 0、无同伴接缝时 `peerCheck.seam=false` 自曝 ✓；**零机制＝没有等待者、`wait()` 会以具名拒/立即 noProgress 收场**，但 `status()` 作为状态面**放行不拒** ✓。★ 判据＝**状态面可读、不拒**；"没有等待者"**不得**被读成"等待原语没生效"（由 `falsify` 族证明 future-only 与 disposer 真会红 ✓）'),
  fidelity: G('ok 或 object', '**先实测后登记**（Round 3 探针）：零声明下 `status()` ⇒ **ok（object）**——缺陷登记数为 0、`durable:false` 在无 fs 接缝时**具名自曝** ✓；**C-45 是内核谓词、强制不可配置**（零个设置键）⇒ 零机制＝**没有已声明缺陷 ⇒ 不改写任何票**，状态面放行不拒 ✓。★ 判据＝**状态面可读、不拒**；"0 条缺陷"**不得**被读成"强制点没接线"（由 `vmu-fidelity-abstention` 的改写断言证明 ✓）'),
  custody: G('ok 或 object', '实测（轮 224）：零声明下 status() ⇒ ok（entries: 0；chainRequired: true 自曝 ✓）；无条目⇒无可转移对象，**不拒** ✓'),
  explain: G('具名拒（带 code）', '实测（轮 224）：矩阵的**探针**调用在零声明下【具名拒】 ✓——render() 无报告可渲染时以 VMU_INVALID_ARGUMENT 具名拒（status() 本身仍是 ok ✓，但探针走的是调用路径 ⇒ 期望取实测的拒 ✓）。**不假装成功** ✗'),
  control: G('ok 或 object', '实测（轮 224）：零声明下 status() ⇒ ok（paused: []、registrySize: 0；archivingNeverPausedByItself 与 idleNeverRecessesByItself 自曝两条不变式 ✓）'),
  citations: G('ok 或 object', '实测（轮 224）：零声明下 status() ⇒ ok（entries: 0；freeTextIsOffByDefault: true 自曝 ✓）；无条目⇒无可渲染对象，**不拒** ✓'),
  // ROUND 2 (handover): the faces the round added. EVERY row here is MEASURED by this generator first (run it without
  // flags and read the 返回形状/自曝字段 columns), never guessed - that is the rule this table exists to enforce.
  // note 只写形状与理由：键数由本生成器的实测输出给出，不手写 ✓。
  chat: G('ok 或 object', '实测（轮 2）：零声明下 list() ⇒ **ok**（自曝 dropped=0、truncated=false ⇒ 零机制＝无群聊/无收件人 ⇒ 清单可读、**不拒** ✓）'),
  ids: G('ok 或 object', '实测（轮 2）：零声明下 status() ⇒ **ok**（唯一 id 分配面：无声明仍可读状态，**不拒** ✓）'),
  mailbox: G('ok 或 object', '实测（轮 2）：零声明下 plan() ⇒ **ok**（自曝 enforced=[1] ⇒ 投递计划可读、**不拒** ✓）；无收件人⇒无可投递对象 ✓'),
  mathadapters: G('具名拒（带 code）', '实测（轮 2）：零声明下 plan() ⇒ 具名拒 **VMU_MATH_INVALID_INPUT**（零机制＝无适配请求 ⇒ **具名拒即真实形状** ✓；不假装成功 ✗）'),
  panel: G('ok 或 object', '实测（轮 2）：零声明下 status() ⇒ **ok**（自曝 dropped 列表 ⇒ 零机制＝无成员面板可报 ⇒ 状态可读、**不拒** ✓）'),
  report: G('ok 或 object', '实测（轮 2）：零声明下 status() ⇒ **ok**（自曝 enforced=[11]、truncated=0 ⇒ 汇报面可读、**不拒** ✓）；无可汇报内容时仍给形状而非拒 ✓'),
  // `resume` needs a REAL store/work/control/identity injection before its factory returns at all, so the probe
  // records `create 抛出` and this row follows the convention used by `store` / `work` / `library` / `math`:
  // a named missing-inputs row, counted under probe-errors, NOT an invented expectation.
  resume: G('PROBE_NEEDS_ARGS', '缺：`store`／`work`／`control`／`identity` 注入（工厂需要真实接缝才返回实例）；补参后应按实测形状裁定 ✓'),
  // ROUND 235: the extracted policy checkers. Measured: `createLibraryPolicy` answers an object of six checker functions
  // and has NO `status()` at all, so the matrix does not apply to it - the same form used for other utility modules. Its
  // behaviour is covered where it is USED, by the library suites that call every one of the six.
  'library-policy': G('EXPECT_NA', '非服务模块（无 `status()`；返回六个纯检查器 ✓）—— 行为由调用它的 library 套件覆盖 ✓'),
  // ROUND 247: MEASURED with nothing declared - status() answers ok with the declared pack list empty, while gate() refuses by name
  // (`VMU_META_VALIDATION_FAILED` for an unknown domain, and `VMU_GATE_UNSATISFIED` naming every missing item for a domain whose
  // required evidence is absent). The face is fail-closed by design, which is exactly why it must be ruled rather than assumed.
  domaincompliance: G('ok 或 object', '实测（轮 247）：零声明下 status() ⇒ ok（declared=[]、trail=0 自曝 ✓）；gate() 对**未满足的必答项【逐项点名】**并拒（VMU_GATE_UNSATISFIED ✓），**fail-closed 是设计**（20 卷 §9.4① 明文：闸未满足 ⇒ 动作不发生 ✓）'),
  partnership: G('ok 或 object', '实测（轮 276）：零声明下 status() ⇒ ok（entities=0、zeroMechanism=true 自曝 ✓）；validateInvoice() 对**缺声明的税务字段位【逐位点名】**并拒（VMU_TAX_FIELD_MISSING）；绑定未登记实体拒（VMU_ENTITY_UNKNOWN）✓'),
  reviewers: G('ok 或 object', '实测（轮 279）：零声明下 status() ⇒ ok（reviewers=0、zeroMechanism=true 自曝 ✓）；assign() 对【已声明冲突】具名拒（VMU_COI_VIOLATION）、对【达并发上限】具名拒（VMU_REVIEWER_OVERLOADED）；盲评解绑无理由拒（VMU_BLIND_UNBIND_DENIED）✓'),
  guard: G('EXPECT_NA', '非服务模块（无 `create*` 工厂 ⇒ 不适用 ✓）'),
  // Round 90-91: the grant face (temporary, scoped, single-command authorization, ported from the v5r line). Its
  // zero mechanism is `vmu.grant.enabled=false`, where NOTHING may be granted or checked and every attempt is
  // refused BY NAME - so the honest expectation is a named refusal, not an ok.
  grant: G('具名拒（带 code）', '零机制：`vmu.grant.enabled=false` ⇒ `grant()`／`check()` 均**具名拒 `VMU_NOT_PERMITTED`**（"this face grants nothing (zero mechanism)" ✓）；开启后 `commands` 枚举外亦具名拒 ✓；`check()` 无授予 ⇒ 具名拒 ✓'),
  // Round 48: the instant normaliser became a shared kernel tool and therefore a new file the matrix sees. It is
  // a PURE FUNCTION module - no factory, no service, nothing to probe - so it is registered as not-applicable for
  // the same measured reason as `guard` rather than given an invented expectation. It exists because compliance
  // and the domain gate each had their own copy of the same normaliser, and two copies drift.
  timevalue: G('EXPECT_NA', '纯函数工具模块（**无 `create*` 工厂** ⇒ 矩阵不适用 ✓）；它存在的原因是 `ms()` 曾在 `compliance`／`domaingate` **各有一份**（**两份实现会漂移** ✗✓ ⇒ 已抽为单一真源 ✓）'),
  // ROUND 31 (task-149 C③): `meetingdomain` was EXTRACTED out of `meetings.js` (the eleven strict meeting domains;
  // `meetings.js` 1199 -> 1196, i.e. the file pinned at the 1200 limit went DOWN).
  // ★ WHICH WORD, AND WHY (the vocabulary is a CLOSED set — read, not guessed): the generator's OWN measured row is
  // `refusal` with code `VMU_NO_SUCH_OBJECT`, and `judge()` reddens a refusal WITHOUT a code. The word in the closed
  // set that says exactly that is `具名拒（带 code）` (the word `grant` already uses): measured shape and allowed
  // value agree, so nothing was forced.
  // ZERO MECHANISM, VERBATIM: `createMeetingDomains({ clock })` with NO seams injected still BUILDS (the table is
  // pure; all eleven keys fall back to their declared defaults), and the probe then calls `read()` with no argument
  // — i.e. asks for a key this module never declared — which is refused BY NAME (`VMU_NO_SUCH_OBJECT`, "no declared
  // domain for undefined"). ⇒ zero mechanism = "ask me for something I did not declare and I refuse by name",
  // never a silent `null` and never an invented default.
  meetingdomain: G('具名拒（带 code）', '轮 31 从 `meetings.js` 抽出（11 个严格域：读取侧具名拒，不再静默夹取；`meetings.js` 1199→1196，被顶满的文件**下降**）。**实测零机制形状**：工厂 `createMeetingDomains({clock})`（**不注入任何接缝**）仍能建（表是纯的、11 键回落声明默认值）⇒ 探针调 `read()`（无参 ⇒ 问一个未声明键）⇒ **具名拒 `VMU_NO_SUCH_OBJECT`**（"no declared domain for undefined"）⇒ 零机制＝"**问我没声明过的东西就具名拒**"，不静默 `null`、不臆造默认值 ✓。★ 期望词表是**闭集**：本行取闭集里的 `具名拒（带 code）`（实测 `shape=refusal` ＋ `VMU_NO_SUCH_OBJECT` 与之逐字对应；`judge()` 判"无名拒"为红）。'),
  // ROUND 32 (task-157): `receiptbounds` was EXTRACTED out of `host.js` when that file crossed the 1200-line rule
  // (1231 → 1151; nothing was added to `KNOWN`). CLOSED-SET EVIDENCE, VERBATIM: the registry's three values are
  // listed at `:30` (`形状 ✓／EXPECT_UNDECIDED ✓／EXPECT_NA（非服务模块 ✓）`), and `:237` routes any module with NO
  // `create*` factory to the non-service branch (`'跳过（非服务模块）'`). This module's actual form is a plain constant
  // (`MAX_TOOL_RESULT_BYTES`) plus one pure function (`boundedToolResult(value)`) - NO `create*` factory, no service,
  // nothing to probe - which corresponds verbatim to `EXPECT_NA`. Same category, and the same reason for existing, as
  // the `contentvalue` row below (`:176`), which is also a pure-function module extracted to get under 1200.
  receiptbounds: G('EXPECT_NA', '纯函数工具模块（**无 `create*` 工厂** ⇒ 矩阵不适用 ✓）；轮 32 从 `host.js` 抽出（该文件 **1231 行越过 1200** ⇒ 抽取，**未往 `KNOWN` 加名字** ✓，`host.js` 1231→1151）：回执尺寸契约 `MAX_TOOL_RESULT_BYTES` ＋ **结构内、路径级**省略 `boundedToolResult(value)`（**不动键、不动数组长度**；其形状与 `elided:[{path,from,to,bytes}]` 由 `tests/vmu-receipt-truncation.test.mjs` 覆盖 ✓）。'),
  meetingmarker: G('ok 或 object', '轮 11 从 `meetings.js` 抽出（F51 标记族：域派生/耐久接缝/读面/自曝；`meetings.js` 1244→1198 ✓）。**实测零机制形状**：工厂 `createMeetingMarker({clock})`（**不注入 `durable`**）⇒ 首个零参操作 `status()` 回 **object**，其中 **`bound:false`／`durableMarker:false`** 自曝、**不声称任何"开着"的会** ✓ ⇒ 零机制＝"**没有域接缝就明说自己没有**"，而不是假装有 ✓（有 `create*` 工厂 ⇒ 不适用 EXPECT_NA）。★ 期望词表是**闭集**：我先写裸 `object` 被判 mismatch（fail-closed ✓），必须用词表里的 `ok 或 object`。'),
  // Round 9: the same measured reason as `timevalue` - `contentvalue` is a pure-function module (no `create*` factory,
  // no service, nothing to probe), extracted out of `resume.js` when the file crossed the 1200-line rule. It is
  // registered EXPECT_NA rather than given an invented expectation.
  contentvalue: G('EXPECT_NA', '纯函数工具模块（**无 `create*` 工厂** ⇒ 矩阵不适用 ✓）；轮 9 从 `resume.js` 抽出（该文件越过 1200 行 ⇒ 拆分，未往 `KNOWN` 加名字 ✓）：值标识原语 `stableStringify/contentDigest/clone/idSuffix`，纯函数零依赖 ✓'),
  // ROUND 8 (phase 2, A1 step 1): `reportfeedback` is a NEW kernel module rather than an extraction - written for the
  // reporting feedback loop. It falls in the SAME category as `receiptbounds` above: pure functions, NO `create*`
  // factory, no service, nothing to probe - which the closed value list at `:30` maps to `EXPECT_NA`. It is recorded
  // here because the matrix treats a module that EXISTS without a row as a FINDING (`出现了却没有裁定行 ✗`), so the
  // row was forced by the module landing, not chosen for convenience. The author's step-2 segment is expected to
  // confirm or replace this adjudication; until then this is the Lead's reading of the module's shape.
  reportfeedback: G('EXPECT_NA', '纯函数工具模块（**无 `create*` 工厂** ⇒ 矩阵不适用 ✓）；轮 8（第二阶段 A1 第一步）**新增**（非抽取）：报告反馈回路的纯函数 —— `REPORT_FEEDBACK_MAX_BYTES = 65536`（★ 宿主先例，非我们发明，且宿主不替我们强制）／`REPORT_FEEDBACK_CONTEXT_ORDER = 5000`（**显式有限数字**，不发明槽名）／`assertFiniteOrder`（我们补宿主缺的校验）／`reportFeedbackReceipt`（**9 键恒存在**、空态用值表达）／`reportFeedbackFailure`（复用已登记码 `VMU_EXTERNAL_UNAVAILABLE`）／`boundFeedback`（截断**自述**）。★ **Part A 已落**：设置键已在 `settings/schema.js` 声明，并被 `kernel/report.js` 的 `cfg()` **真读**（两处 `sget` ⇒ 这才是"有人读"的证据，不是 `LIVE_READERS` 那行），回执**恒带 9 键**且以**真话**具名"投递调用尚未接线"；★★ **投递调用（`systemPrompt.context()`）属 Part B**，必须落在 `vibe-math-vmu.js:797` 那个 `if` **之外**（那个 `if` 只在有提示词文本时进入 ⇒ 放进去就会"开关开了也不生效"）。★ 本行仍**待作者第二步复核**（若模块长出服务/`status()` ⇒ 连登记值一起改）。'),
}

const shape = (v) => {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array[' + v.length + ']'
  if (typeof v !== 'object') return typeof v + '(' + JSON.stringify(v) + ')'
  if (v.ok === false) return 'refusal'
  if (v.ok === true) return 'ok'
  return 'object'
}
const disclosed = (v) => {
  if (!v || typeof v !== 'object') return '—'
  const keys = ['enforced', 'fired', 'assumed', 'absent', 'dropped', 'droppedBytes', 'noop', 'validated', 'enforcedScope', 'truncated']
  const hit = keys.filter((k) => v[k] !== undefined).map((k) => k + '=' + (Array.isArray(v[k]) ? '[' + v[k].length + ']' : String(v[k])))
  return hit.length ? hit.join(' ') : '—'
}

// task-204 (batch 1/4): EXPLICIT probe arguments, each copied from the module's OWN test (never guessed ✗):
//   budget      → tests/vmu-budget.test.mjs:16       b.open({ scope: 's0' })                       (zero-config unlimited)
//   records     → tests/vmu-records.test.mjs:103     r.put({ track, kind, title, body, settled:true })
//   memory      → tests/vmu-memory.test.mjs:63       m.record({ kind, text, by, evidence, scope, tags })
//   transaction → tests/vmu-transaction.test.mjs:62  tx.begin({ id, steps:[{ service, apply, undo }] })
// The clock stays injected (`clock: () => 0`) so probes are deterministic and read-only (no disk, no repo writes).
const PROBE_ARGS = {
  budget: { op: 'open', args: { scope: 'probe' } },
  records: { op: 'put', args: { track: 'progress', kind: 'progress', title: 'probe', body: 'probe', settled: true } },
  memory: { op: 'record', args: { kind: 'lesson', text: 'rebase before the long run', by: 'alpha', evidence: ['lib-1'], scope: 'team', tags: ['process'] } },
  transaction: { op: 'begin', args: { id: 'probe-tx', steps: [{ service: 'probe', apply: () => 1, undo: () => 1 }] } },
  // task-214 batch 3/4 — shapes copied from each module's OWN test (never guessed ✗):
  //   arbitration → tests/vmu-arbitration.test.mjs:261  d.open({ parties: ['p1','q1'], subject: 's1' })
  //   charter     → tests/vmu-charter.test.mjs:236      d.propose({ kind:'charter', text, by, articles:[{id}] })
  //   delegation  → tests/vmu-delegation.test.mjs:30    d.check({ actor: 'nobody', action: 'task/create' })
  //   handover    → tests/vmu-handover.test.mjs:27      a.open({ from: 'r-1', to: 'r-2' })
  arbitration: { op: 'open', args: { parties: ['probe-p1', 'probe-q1'], subject: 'probe subject' } },
  charter: { op: 'propose', args: { kind: 'charter', text: 'probe charter', by: 'office', articles: [{ id: 'A-1', text: 'probe article' }] } },
  delegation: { op: 'check', args: { actor: 'nobody', action: 'task/create' } },
  handover: { op: 'open', args: { from: 'probe-from', to: 'probe-to' } },
  //   paper → tests/vmu-paper.test.mjs:39  p.start({ title, sections, contributors, editor })
  paper: { op: 'start', args: { title: 'probe manuscript', sections: ['probe-introduction'], contributors: { 'probe-introduction': 'probe-m1' }, editor: 'probe-editor' } },
  // Round 4: the op is pinned EXPLICITLY. `mathjobs` has both `submit` (needs arguments ⇒ named refusal) and
  // `list` (the state/list face ⇒ empty array under zero mechanism), and without a pin the probe took whichever
  // matched first and reported a shape the expectation does not describe. The expectation documents BOTH sides;
  // the probe measures the STATE face, so it must say so.
  mathjobs: { op: 'list', args: {} },
}

/** 探测一个模块：**不传 settings** ✗；先用第一个 `create*` 工厂，再调它的首个零参操作 ✓（有显式探针参数时用 PROBE_ARGS ✓）。 */
async function probe(file) {
  const name = file.replace(/\.js$/, '')
  const spec = PROBE_ARGS[name] || {}
  const mod = await import(pathToFileURL(join(KERNEL, file)).href)
  // PREFER the factory that names THIS module (`mathjobs.js` → `createMathJobs`), not merely the first
  // `create*` export. Round 4 measured the failure this prevents: `kernel/mathjobs.js` gained a second
  // factory (`createChildBudget`) whose export order made it the "first" match, so the probe instantiated
  // an auxiliary helper that exposes no operations and reported the module as `（无操作）` — a FALSE red
  // about the module (the service factory was fine all along). Fall back to the first `create*` so
  // differently-named factories (`work.js` → `createWorkLedger`, `store.js` → `createStore`) still work.
  const factories = Object.keys(mod).filter((k) => /^create[A-Z]/.test(k) && typeof mod[k] === 'function')
  const want = 'create' + name.charAt(0).toUpperCase() + name.slice(1)
  const factoryKey = factories.find((k) => k.toLowerCase() === want.toLowerCase()) || factories[0]
  if (!factoryKey) return { module: name, shape: '（无 create* 工厂）', refusal: '—', disclosed: '—', note: '跳过（非服务模块）' }
  let inst
  try { inst = mod[factoryKey]({ clock: () => 0 }) } catch (e) { return { module: name, shape: 'create 抛出', refusal: '—', disclosed: '—', note: String((e && e.message) || e) } }
  if (spec.op && typeof inst[spec.op] !== 'function') return { module: name, shape: 'PROBE_NEEDS_ARGS', refusal: '—', disclosed: '—', note: '探针指定的 op 不存在：' + spec.op }
  const opKey = spec.op || Object.keys(inst).find((k) => typeof inst[k] === 'function' && /^(open|run|plan|put|status|state|advance|submit|check|build|propose|stages|record|list)$/.test(k))
    || Object.keys(inst).find((k) => typeof inst[k] === 'function')
  if (!opKey) return { module: name, shape: '（无操作）', refusal: '—', disclosed: '—', note: '跳过' }
  let out
  try { out = await inst[opKey](spec.args || {}) } catch (e) {
    // task-214: a NAMED refusal (carrying `e.code`) is a MEASUREMENT of the module, not a broken probe.
    // Conflating the two hid the difference for a whole round (`memory.record` without `scope` refused by
    // name with VMU_MEMORY_KEY_UNSCOPED yet was reported as `op 抛出`). Keep them apart, and report the
    // disclosure facts the refusal actually carries (`enforced` / `enforcedScope`).
    if (e && e.code) {
      const ex = e.enforced, es = e.enforcedScope
      const parts = []
      if (ex !== undefined) parts.push('enforced=' + (Array.isArray(ex) ? '[' + ex.length + ']' : String(ex)))
      if (es !== undefined) parts.push('enforcedScope=' + String(es))
      return { module: name, op: opKey, shape: 'refusal', refusal: String(e.code), disclosed: parts.length ? parts.join(' ') : '—', note: opKey + '() 具名拒 ' + e.code + '：' + String(e.message || '') }
    }
    return { module: name, op: opKey, shape: 'op 抛出', refusal: '—', disclosed: '—', note: 'no code: ' + String((e && e.message) || e) }
  }
  const v = (out && typeof out === 'object' && 'value' in out) ? out.value : out
  return {
    module: name, op: opKey, shape: shape(v),
    refusal: (v && v.ok === false && v.code) ? String(v.code) : (v && v.ok === false ? '（无名）✗' : '—'),
    disclosed: disclosed(v),
    note: (v && v.ok === false) ? '具名拒（零机制下拒绝 ✓）' : (v && v.ok === true ? '放行 ✓' : '—'),
  }
}

function build(rows) {
  const head = '| 模块 | 零机制下的返回形状 | 是否具名拒（码） | 自曝字段 | 期望（设计） |'
  const sep = '|---|---|---|---|---|'
  const body = rows.map((r) => {
    const e = EXPECT[r.module]
    const exp = e ? (e.shape + '（' + e.note + '）') : '（**设计未定** ✗：本模块未登记期望）'
    return '| `' + r.module + (r.op ? '` · `' + r.op + '()`' : '`') + ' | ' + r.shape + ' | ' + r.refusal + ' | ' + r.disclosed + ' | ' + exp + ' |'
  })
  return [head, sep].concat(body).join('\n')
}

/** 漂移判定 ✓：**只对已登记期望的模块**比对；未登记 ⇒ 计数不算红（设计未定 ✓）；
 *  `probe-error`（op 需参数 ⇒ 探针缺参）**不算零机制缺陷** ✗✓，单列计数 ✓；**具名拒无名 ⇒ 红** ✗✓。 */
function judge(rows) {
  const mism = []
  let unregistered = 0
  let probeErrors = 0
  let undecided = 0
  let na = 0
  for (const r of rows) {
    const e0 = EXPECT[r.module]
    // **先看登记**（显式待办/不适用 ⇒ 明确计数，不红 ✓）；再判"无名拒"与形状 ✓
    if (e0 && e0.shape === 'EXPECT_NA') { na += 1; continue }
    if (e0 && e0.shape === 'EXPECT_UNDECIDED') { undecided += 1; continue }
    // **规则收紧（第 33 轮）** ✗✓✓：**"模块出现了却没有裁定行" ⇒ 必须红**（**每个模块都必须被裁定** ✓）；
    //   `EXPECT_UNDECIDED` 仍是"**显式待办**、只计数不判红" ✓✓ —— **"未定"与"漏了"必须分开** ✗✓。
    // ★ ROUND 12 / task-95（vmu-core 定位、我修）：**这道检查必须排在"探针抛出就跳过"之前**。原来抛出先
    //   `continue`，于是"**没有裁定行 + 探针抛出**"的模块两个计数器都不进（`0 unregistered`），而矩阵却把它
    //   印成"设计未定 ✗" ⇒ **打印与计数互相矛盾**，R10/R11 拆出的两个模块就这样悬了两轮。现在的顺序保证：
    //   **未登记 ⇒ 红（无论探针是否抛出）**；登记了 `PROBE_NEEDS_ARGS`／`EXPECT_*` 的仍按各自的语义计数 ✓。
    if (!e0) {
      unregistered += 1
      mism.push(r.module + ': **出现了却没有裁定行** ✗（给期望，或显式登记 `EXPECT_UNDECIDED` ✓）')
      continue
    }
    if (/抛出|import 失败|create 抛出/.test(r.shape)) { probeErrors += 1; continue }
    if (e0 && e0.shape === 'PROBE_NEEDS_ARGS') { probeErrors += 1; continue }
    if (r.refusal === '（无名）✗') { mism.push(r.module + ': 拒绝**没有具名码** ✗'); continue }
    const s = r.shape
    const okShape = (e0.shape === '具名拒或 ok') ? (s === 'refusal' || s === 'ok')
      : (e0.shape === 'ok 或 object') ? (s === 'ok' || s === 'object')
        : (e0.shape === 'ok 或 null') ? (s === 'ok' || s === 'null')
          : (e0.shape === 'array 或 object') ? (s === 'array[15]' || s === 'object' || s === 'array[0]' || /^array/.test(s))
            : (e0.shape === 'array') ? (/^array/.test(s))
              : (e0.shape === 'ok（显式 absent）') ? (s === 'ok' && /absent=/.test(r.disclosed))
                : (e0.shape === '按声明默认开成') ? (s === 'ok')
                  : (e0.shape === '具名拒（带 code）') ? (s === 'refusal' && r.refusal !== '—')
                    : false
    if (!okShape) mism.push(r.module + ': 实测 `' + s + '`／自曝 `' + r.disclosed + '` ≠ 期望「' + e0.shape + '」')
  }
  return { mism, unregistered, probeErrors, undecided, na }
}

const main = async () => {
  const files = readdirSync(KERNEL).filter((f) => f.endsWith('.js')).sort()
  const rows = []
  for (const f of files) { try { rows.push(await probe(f)) } catch (e) { rows.push({ module: f, shape: 'import 失败', refusal: '—', disclosed: '—', note: String((e && e.message) || e) }) } }
  const table = build(rows)
  const { mism, unregistered, probeErrors, undecided, na } = judge(rows)
  const last = '=== ZERO-MECHANISM MATRIX: ' + rows.length + ' modules, ' + mism.length + ' mismatches, ' + unregistered + ' unregistered, ' + undecided + ' EXPECT_UNDECIDED, ' + probeErrors + ' probe-errors, ' + na + ' n/a ==='
  const block = [BEGIN, '<!-- 本块由 `scripts/generate-zero-mechanism-matrix.mjs` 生成（生成式 ✓，勿手写 ✗） -->', '', table, '', last, END].join('\n')

  const args = process.argv.slice(2)
  if (args.includes('--selftest')) {
    // **自证（不写文件 ✓）**：① 期望改错 ⇒ **必红** ✗✓；② `EXPECT_UNDECIDED` ⇒ **不红但计数** ✓
    const real = { ...EXPECT }
    const base = judge(rows).mism.length   // **基线**：真实行里已有的 mismatch 数（如未裁定模块 ⇒ 红 ✓）
    let bad = 0
    EXPECT.audit = { shape: '具名拒（带 code）', note: '自证：故意改错（audit 实际是只读放行 ⇒ 应红）' }
    const j1 = judge(rows)
    console.log('selftest ①: mismatches=' + j1.mism.length + ' (期望 >0 ⇒ ' + (j1.mism.length > 0 ? 'PASS ✓' : 'FAIL ✗') + ')')
    if (j1.mism.length === 0) bad += 1
    delete EXPECT.audit
    const j2 = judge(rows)
    // **增量断言**（第 33 轮 ✓）：删掉一个已登记模块 ⇒ `unregistered` **恰 +1** ✓ ⇒ 且按新规则**必须红** ✓
    const incOk = (j2.unregistered === j1.unregistered + 1 || j2.unregistered === 1)
    const redOk = j2.mism.some((x) => /audit: \*\*出现了却没有裁定行\*\*/.test(x))
    console.log('selftest ②: audit 未登记 ⇒ unregistered=' + j2.unregistered + ' mismatches=' + j2.mism.length + ' (期望 unregistered 恰 +1 ⇒ ' + (incOk ? 'PASS ✓' : 'FAIL ✗') + '；且**必须红** ⇒ ' + (redOk ? 'PASS ✓' : 'FAIL ✗') + ')')
    if (!(incOk && redOk)) bad += 1
    // ⑤ **造一个未登记模块的 fixture ⇒ 必须红** ✓✓（这条正是本缺口 ✓）
    const j5 = judge(rows.concat([{ module: 'brand-new-module-fixture', shape: 'ok', refusal: '—', disclosed: '—', note: '' }]))
    const named5 = j5.mism.some((x) => /^brand-new-module-fixture: \*\*出现了却没有裁定行\*\*/.test(x))
    console.log('selftest ⑤: 未登记模块 fixture ⇒ mismatches=' + j5.mism.length + '（点名 fixture=' + named5 + ' ⇒ ' + (named5 ? 'PASS ✓' : 'FAIL ✗') + ')')
    if (!named5) bad += 1
    EXPECT.audit = { shape: 'EXPECT_UNDECIDED', note: '自证：显式待办（→ 计数，不红 ✓）' }
    const j3 = judge(rows)
    console.log('selftest ③: audit=EXPECT_UNDECIDED ⇒ undecided=' + j3.undecided + ' mismatches=' + j3.mism.length + ' (期望 undecided≥1 且 mismatches=基线 ' + base + ' ⇒ ' + ((j3.undecided >= 1 && j3.mism.length === base) ? 'PASS ✓' : 'FAIL ✗') + ')')
    if (!(j3.undecided >= 1 && j3.mism.length === base)) bad += 1
    // ④ 期望与**模块实际返回**不符 ⇒ **mismatch 红** ✓（点名到模块 ✓）
    EXPECT.audit = { shape: '具名拒（带 code）', note: '自证 ④：与实测（只读放行）不符 ⇒ 必须红' }
    const j4 = judge(rows)
    const named = j4.mism.some((x) => /^audit:/.test(x))
    console.log('selftest ④: 期望 vs 实测不符 ⇒ mismatches=' + j4.mism.length + '（点名 audit=' + named + ' ⇒ ' + ((j4.mism.length > 0 && named) ? 'PASS ✓' : 'FAIL ✗') + ')')
    if (!(j4.mism.length > 0 && named)) bad += 1
    // ⑥⑦ **task-214 自证**：具名拒（有 code）与真崩溃（无 code）必须被**分开记录** ✓✓
    //   —— 这一对正是本轮修掉的口径缺陷；两条都在**同一进程内临时覆盖 `PROBE_ARGS`**，随后还原 ✓
    {
      const savedMemory = { op: PROBE_ARGS.memory.op, args: { ...PROBE_ARGS.memory.args } }
      const savedBudget = PROBE_ARGS.budget
      try {
        PROBE_ARGS.memory.args.scope = null            // 必然触发具名拒（vmu.memory.scopeRequired 默认 true）
        const rNamed = await probe('memory.js')
        const namedOk = rNamed.shape === 'refusal' && rNamed.refusal === 'VMU_MEMORY_KEY_UNSCOPED'
        console.log('selftest ⑥: 具名拒 ⇒ shape=' + rNamed.shape + ' refusal=' + rNamed.refusal + ' (期望 refusal + 码，**不是** op 抛出 ⇒ ' + (namedOk ? 'PASS ✓' : 'FAIL ✗') + ')')
        if (!namedOk) bad += 1
        PROBE_ARGS.budget = { op: 'open', args: { get scope() { throw new Error('boom') } } }   // 取属性即抛：无 code ⇒ 真崩溃
        const rCrash = await probe('budget.js')
        const crashOk = rCrash.shape === 'op 抛出' && rCrash.refusal === '—' && /^no code: boom/.test(String(rCrash.note))
        console.log('selftest ⑦: 真崩溃 ⇒ shape=' + rCrash.shape + ' refusal=' + rCrash.refusal + ' note=' + String(rCrash.note).slice(0, 32) + ' (期望 op 抛出 + no code ⇒ ' + (crashOk ? 'PASS ✓' : 'FAIL ✗') + ')')
        if (!crashOk) bad += 1
      } finally {
        PROBE_ARGS.memory = savedMemory
        PROBE_ARGS.budget = savedBudget
      }
    }
    for (const k of Object.keys(EXPECT)) if (!(k in real)) delete EXPECT[k]
    EXPECT.audit = real.audit
    console.log('=== ZERO-MECHANISM SELFTEST: ' + (bad === 0 ? 'GREEN' : 'RED') + ' (' + bad + ' failed) ===')
    process.exit(bad > 0 ? 1 : 0)
  }
  // ── ROUND 150：计划键积压【实测输出】，且 EXPECT 里的【手写键数】直接判红 ✓✓ ──────────────────────────
  {
    const { readdirSync } = await import('node:fs')
    const { pathToFileURL } = await import('node:url')
    const found = []
    for (const f of readdirSync(KERNEL).filter((x) => x.endsWith('.js')).sort()) {
      try {
        const mod = await import(pathToFileURL(join(KERNEL, f)).href)
        for (const [name, val] of Object.entries(mod)) {
          if (!Array.isArray(val) || !/PLANNED|UNWIRED|NOT_WIRED/i.test(name)) continue
          found.push({ file: f, name, n: val.length, keys: val.map((e) => (Array.isArray(e) ? String(e[0]) : String(e))) })
        }
      } catch (e) { /* 模块自身 import 失败是矩阵的发现，不是这个计数器的 */ }
    }
    const total = found.reduce((a, b) => a + b.n, 0)
    console.log('planned backlog (measured, module-side): ' + found.length + ' face(s), ' + total + ' entries'
      + (found.length ? ' :: ' + found.map((r) => r.file.replace('.js', '') + '=' + r.n).join(' ') : ' :: none'))
    /**
     * ★ 为什么要把这条做成红 ✗✓：EXPECT 的 note 里写"17 键中 14 已接／3 未接"这类**手写键数**，会在键一移动的
     * 那一刻变成假话 —— 本轮实测就抓到这样一条：那个面已经 17/0，而这句话还留在这里一个轮次 ✗。
     * note 只该写**形状与理由** ✓；键数由上面那行**从模块自己身上**数出来 ✓。
     */
    for (const [k, e] of Object.entries(EXPECT)) {
      if (e && /(\d+\s*\/\s*\d+(\s*键已接)?|\d+\s*(已接|未接|wired|planned))|\d+\s*键已接/.test(String(e.note || ''))) {
        mism.push(k + ': EXPECT 的 note 里写着**手写键数**（"…已接…／…未接…"）✗ ⇒ 键数由本生成器实测输出 ✓，note 只写形状与理由 ✓')
      }
    }
  }

  if (args.includes('--write')) {
    const doc = readFileSync(DOC, 'utf8')
    const next = doc.includes(BEGIN) ? doc.replace(new RegExp(BEGIN + '[\\s\\S]*?' + END), block) : doc.trimEnd() + '\n\n' + block + '\n'
    writeFileSync(DOC, next)
    console.log('written: ' + mism.length + ' mismatches, ' + unregistered + ' unregistered')
  } else if (args.includes('--check')) {
    const doc = readFileSync(DOC, 'utf8')
    const m = doc.match(new RegExp(BEGIN + '([\\s\\S]*?)' + END))
    if (!m) { console.log('FAIL generated block not found in 11-gates-and-development.md'); process.exit(1) }
    const onDisk = (BEGIN + m[1] + END).trim()
    if (onDisk !== block.trim()) { console.log('FAIL matrix drifted (run without --write/--check to see, then --write)'); process.exit(1) }
    console.log(last)
  } else {
    console.log(table); console.log(last)
  }
  for (const x of mism) console.log('FINDING ' + x)
  process.exit(mism.length > 0 ? 1 : 0)
}
main()
