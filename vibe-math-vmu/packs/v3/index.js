/**
 * THE v3 PACK FOLDER (PHASE 6 · goal 2)：把 `vibe-math-v3` 的机制复刻成 vmu 的一个整合包。
 *
 * ★ 本包与 `packs/v3-core/` 是【互斥装载】的两个机构（部署二选一，docs/acceptance/
 *   phase6-v3-p0-build-checklist.md §3）：v3-core 是"机构外壳"的近似示范（它自己也写着 NOT v3、不是行为等价
 *   证明），v3 是把 v3 的运转机制真正落成 pack 的那一个。
 *
 * 已落：
 *   · P0-1 周期驱动 —— settings/defaults.json 的 schedule 种子（值层）＋ middleware/tick.js。
 *   · P0-9 数据面 —— defaults.json 的 records 五键（轨/kind 白名单/未定稿可写/正文上限/条数上限；都是
 *     **构造期快照**；P0-4 又加第六把 history.storeMode=full）＋ middleware/dataplane.js（三卡 compose/parse、正文段保留、有界写入与 dropped 计数、
 *     索引重建与坏卡点名、Verified 分裂、tick 驱动的 5s 节流索引）。
 *   · P0-6 软规范三卡 ＋ Verified 分裂 —— dataplane.js 的 compose/rewrite/promoteVerified ＋
 *     prompts/sections.json 的"可信分层"段（段文本是数据；插件在建内核前按目录名读它）。
 *   · P0-2 规划-调度闭环 ＋ P0-3 规划学习闭环 —— middleware/planner.js（tick → 判可推进 → 组简报 →
 *     调 planner 回合（`turn.run()`，只从 tick 里做）→ 归一化/校验（6 动作白名单／horizon 截断／去重／
 *     逐角色硬校验）→ 按容量执行 → 逐条 outcome 写回 plans 轨；下一次简报带 `last_plan.outcomes`）＋
 *     prompts/planner.js 的规划器提示段（清单 `sections` 通道，带 `scope.role='planner'`）。
 *   · P0-4 方法库 ＋ P0-5 发明上报 —— middleware/methods.js（方法卡的应用记录只在有 qid/dirId 上下文时追加、
 *     改进 v 号单调、可信断言只收概率 1/0 的命题、项目级/全局级两级晋升、耐久库 `<库记录 id>@<n>.md` 冻结修订；
 *     `new_inventions` 入 `inventions` 轨、keeper 到期派发、有产出/无产出两条路都清队且无产出走**幂等兜底建卡**）。
 *     `vmu.records.history.storeMode=full` 进值层（构造期快照；否则版本无快照）。
 *   · P0-7 验证闭环 —— middleware/verify.js（**双写**：内核 `vmu.ballotbox` 强制法定人数、连续 Result 落 `votes` 轨；
 *     pack 纯函数聚合：全 1/全 0／同侧均值≥0.85／forced 等权均值夹 [0.01,0.99]；非全票一致才辩论、轮次有界；
 *     裁决回写三处：命题卡＋`verified` 轨（只经 promoteVerified）＋`journal` 轨）。
 *   · P0-8 人工门 —— middleware/gates.js（判定/台账/放行）＋ planner/verify 的**消费点**：manual 下计划与裁决
 *     写 `awaiting-approval`/待审 journal 并**一条都不执行**；approve 后由注册的执行器执行；切回 auto 由
 *     gates 的 tick 把 pending 一次放行（失败也落终态，绝不留悬空 pending）。
 *   · P0-10 工具面 —— tools.js（10 个 handler：start/pause/status/report/list_decisions/decide/plan/
 *     list_agents/method_list/add_problem）＋ **本文件的 `slots`（planner/solver/verifier，list_agents 的名册
 *     来源）与 `tools` 声明**。★ 工具名由**本包**声明，内核只持有、宿主只发布（kernel/index.js 的
 *     declarePackTools/packTools ＋ host.js 的 host-pack-tools.js）：框架不认识任何 `vibe_math_*` 名字。
 *
 * ★ 值层判据（P0-1 踩过、P0-9 又踩一次会一样的坑）：读点在 createKernel 之前/构造中 ⇒ 只能写
 *   `settings/defaults.json`。`vmu.records.tracks/allowedKinds/requireSettledRecords/bodyCapBytes/
 *   head.maxItems` 在 `kernel/records.js:189-221` 被**快照一次**，写进清单 `settings` 会**永远读不到且不报错**。
 *   `vmu.v3.planningHorizon/plannerEnabled/planMinIntervalMs/plannerMaxFails` 是**调用期**读取（planner 每 tick
 *   用 `api.setting()` 现读，schema 里已登记且有默认值），所以它们不进值层、也不进清单 —— 清单 `settings`
 *   继续为空（P0-1/P0-9 的测试钉住了这一条）。
 *
 * ★ 为什么【没有】manifest 的 `tracks:` 字段（清单 §4 曾建议 v3 扩 tracks）：`kernel/pack.js:479-482` 对
 *   manifest `tracks` 调的是 `kernel.declareTracks()`，它**重建 library** 且第一行 `mustLibrary()` 在无
 *   `root` 的装配上**具名拒**（kernel/index.js:1871-1877）⇒ 加了它，没工作区的部署会在 apply 期拿到 pack 错误；
 *   而且它喂的是 `kernel.library`，**不是** vmu.records 的构造期快照 ⇒ 轨仍然写不进去。轨的唯一生效处是值层。
 *
 * ★ `slots` 与 `tools` 是 P0-10 的两处**声明**（不是设置、不进值层）：slots 让名册存在（list_agents 的数据源），
 *   tools 让工具名从包里来。两者都不改 `settings`（它仍然是空的，见上）。
 */
import { V3_TICK_MODULE, V3_TICK_TOPIC } from './middleware/tick.js'
import { V3_DATAPLANE_MODULE } from './middleware/dataplane.js'
import { V3_PLANNER_MODULE } from './middleware/planner.js'
import { V3_SUBQUESTIONS_MODULE } from './middleware/subquestions.js'
import { V3_REPORTS_MODULE } from './middleware/reports.js'
import { V3_METHODS_MODULE } from './middleware/methods.js'
import { V3_VERIFY_MODULE } from './middleware/verify.js'
import { V3_GATES_MODULE } from './middleware/gates.js'
import { V3_PLANNER_SECTION } from './prompts/planner.js'
// ★ PHASE 6 · 轮 12：P1-6 的 21 段（知识上下文 9／简报 2／论文 3／角色 7）。走**清单 sections 通道**而不是
// `prompts/sections.json`，理由同 planner 段：那个通道会**丢弃 `scope`**，而这 21 段全都靠 `scope` 做互斥。
import { V3_PROMPT_SECTIONS } from './prompts/index.js'
// PHASE 6 / P0-10：10 个工具 handler。★ 名字写在这里（pack 声明），内核/宿主只持有/发布，不认识其中任何一个名字。
import { V3_PACK_TOOLS } from './tools.js'

export const PACK = Object.freeze({
  id: 'v3',
  version: '0.7.0',
  packContractVersion: 1,
  description: 'v3 复刻包（PHASE 6）：P0-1 周期驱动 + P0-9 数据面 + P0-6 软规范三卡与 Verified 分裂 + P0-2/P0-3 规划-调度与学习闭环 + P0-4/P0-5 方法库与发明上报 + P0-7 验证闭环 + P0-8 人工门 + P0-10 工具面（10 个 pack 声明的工具 ＋ planner/solver/verifier 槽位）。与 packs/v3-core 互斥装载；不是行为等价证明。',

  // PHASE 6（目标 3 审计 P1）：互斥从"描述"变成**机器强制**——`pack.js` 的 plan/apply 双向检查，同内核同装二者
  // 会具名拒 `VMU_PACK_CONFLICT`（而不是静默替换 tracks/slots、两套门同时在线）。
  excludes: Object.freeze(['v3-core']),
  // P1-1：同一个 rId 的二次派发是**具名跳过**（不是静默、不是重复建任务）。码登记在清单里（R-d：包命名空间）。
  codes: Object.freeze(['VMU_PACK_V3_DUPLICATE_DISPATCH']),
  // 六个模块在运行期通过 loader 的能力门读 `vmu.records`；planner/methods/verify 还要 `vmu.turn`（K2 已把
  // 回合循环进 M2 服务目录）；verify 还读 `vmu.ballotbox`（**法定人数由内核强制**，见 verify.js 文件头）。
  // gates 读 `vmu.human` 但**不 require** 它：人性面只是"尽力镜像"，台账（records）才是事实源。
  // 在装载期就把依赖声明出来：缺它应当在 apply 时具名拒，而不是等第一次 tick 才炸。
  requires: [
    { service: 'vmu.records', minVersion: 1 },
    { service: 'vmu.turn', minVersion: 1 },
    { service: 'vmu.ballotbox', minVersion: 1 },
  ],

  // ★ 故意【为空】：构造期读取的值一律在 settings/defaults.json（见文件头）。同一键若两处都写，
  // pack.js 会按 O4 判"重叠"并具名拒（它并不会有第二个答案）。
  settings: Object.freeze({}),

  // PHASE 6（目标 3 审计 P1）：本包引入的协议扩展主题。由 pack.js 在装载其 middleware **之前**声明到
  // 运行期总线（owner=本包 id），卸载时 undo 只撤回本包的声明 ⇒ 不会跨内核永久泄漏；重装时重新声明。
  topics: Object.freeze([V3_TICK_TOPIC]),

  // v3 的规则是定量+有状态的（"至少 N 名验证者"、"manual 下不许跑"），M1 的谓词 DSL 表达不了 ⇒ 与 v3-core 一致：
  // P0 不引入 M1。tick/dataplane 也不需要规则。
  rules: Object.freeze([]),

  // P0-10：v3 的机构槽位。名册（kernel.members）由它创建，`vibe_math_list_agents` 读的就是这里；capacity 是
  // 内核强制的并发上限（permissions 是不透明词表 —— 内核只做包含判断，不解释"planner"是什么，D5）。
  slots: Object.freeze([
    { id: 'planner', label: '规划', capacity: 1, permissions: Object.freeze(['plan', 'dispatch', 'gate']) },
    { id: 'solver', label: '求解', capacity: 8, permissions: Object.freeze(['solve', 'propose', 'record']) },
    { id: 'verifier', label: '验证', capacity: 3, permissions: Object.freeze(['verify', 'vote', 'refute']) },
  ]),

  // P0-10：工具面。清单的 `tools[]` 只声明名字/描述/schema/handler；内核校验并把它们交给宿主发布。
  tools: Object.freeze(V3_PACK_TOOLS),

  middleware: Object.freeze([
    {
      id: 'v3-tick',
      // ★ `kind` 字段【故意省略】：`kernel/pack.js` 对无 `kind` 的条目默认按 module 处理（ROUND 20/task-125
      // 的修复，pack.js:533-541），而 `kernel/bus.js` 的静态校验会拒一个【带 kind 但没有 handler】的条目
      // （bus.js:451-456）——清单里的 module 形状条目由 loader 装载并附上 handler，它从来不是"交给总线的原始条目"。
      // 所以这里省略 kind，经 pack.js 归一化后由 loader 走 module 路径；README 里写明这一条。
      order: 100,
      on: Object.freeze([V3_TICK_TOPIC]),
      // 一次 journal 写失败（例如配额）不该让整个调度停摆：'open' 表示总线审计该失败并继续；失败本身绝不静默
      // （bus.js 会记 middleware/failure-policy）。
      failure: 'open',
      // 只 unlock api.services；具体读哪个服务由 tick.js 的能力声明 + services.get 再判一次。
      capabilities: Object.freeze(['trigger-workflow']),
      module: V3_TICK_MODULE,
    },
    {
      // P0-2/P0-3：规划-调度闭环。order 110 落在 tick(100) 与 dataplane(120) 之间：
      // 先由 tick 写 journal → 规划器读 records/跑回合/写 plans → 最后 dataplane 重建索引，于是索引能看到
      // 本 tick 新写的计划与问题卡回写（plan 记录在索引里不是卡片 kind，但问题卡的 `- 计划:` 回写会被收进索引）。
      id: 'v3-planner',
      order: 110,
      // 两个钩子：`v3/tick` 是派发点（tick 不是 turn ⇒ 不撞 VMU_TURN_REENTRANT）；
      // `turn/reply-parsed` 是 K10 的回执归一化点（只落盘 + rewriteResult，绝不在这里再开回合）。
      on: Object.freeze([V3_TICK_TOPIC, 'turn/reply-parsed']),
      // 规划失败（回执不可解析、plans 轨写入被拒）不该让整个调度停摆；失败经总线审计具名 + 本模块把连续失败
      // 计数并在达 plannerMaxFails 后自禁用（绝不静默地一直重试）。
      failure: 'open',
      // trigger-workflow：解锁 api.services（vmu.records / vmu.turn）；rewrite-result：K10 的 decision 能力。
      capabilities: Object.freeze(['trigger-workflow', 'rewrite-result']),
      module: V3_PLANNER_MODULE,
    },
    {
      // P1-4：solver 回执里的 `sub_questions` ⇒ 一次注册**三个**对象（子问题＋判断命题＋临时假设命题）。
      // 只消费 `turn/reply-parsed`（K10 通道）：不派发、不再开回合，所以不需要 rewrite-result。
      id: 'v3-subquestions',
      order: 112,
      on: Object.freeze(['turn/reply-parsed']),
      failure: 'open',
      capabilities: Object.freeze(['trigger-workflow']),
      module: V3_SUBQUESTIONS_MODULE,
    },
    {
      // P1-5：汇报三路。file＝写 reports 轨的持久快照；push＝只在 vmu.v3.reportMode 允许时经 vmu.report 投递，
      // 否则具名跳过；status＝v3ReportsStatus()（与报告同一份快照计数）。tick 里跑，不派发、不开回合。
      id: 'v3-reports',
      order: 130,
      on: Object.freeze([V3_TICK_TOPIC]),
      failure: 'open',
      capabilities: Object.freeze(['trigger-workflow']),
      module: V3_REPORTS_MODULE,
    },
    {
      // P0-4/P0-5：方法库 ＋ 发明上报。两个钩子：
      // `v3/tick` 是 keeper 的**唯一派发点**（tick 不是 turn ⇒ 不撞 VMU_TURN_REENTRANT）；
      // `turn/reply-parsed` 只消费/落盘/改写（K10），绝不在这里再开回合。
      id: 'v3-methods',
      // order 115 落在 planner(110) 与 dataplane(120) 之间：同一 tick 里 keeper 新建的方法卡会被随后的
      // 索引重建看到；而 planner 先跑，方法反馈消费不会与计划执行抢同一个回合起点。
      order: 115,
      on: Object.freeze([V3_TICK_TOPIC, 'turn/reply-parsed']),
      failure: 'open',
      capabilities: Object.freeze(['trigger-workflow', 'rewrite-result']),
      module: V3_METHODS_MODULE,
    },
    {
      // P0-7：验证闭环。`v3/tick` 是**唯一派发点**（逐轮派 verifier-1..N，tick 不是 turn ⇒ 不撞
      // VMU_TURN_REENTRANT）；`turn/reply-parsed` 只消费/双写/改写（K10），绝不在这里再开回合。
      // order 118 落在 methods(115) 与 dataplane(120) 之间：本 tick 的裁决回写（命题卡）先落，索引后重建。
      id: 'v3-verify',
      order: 118,
      on: Object.freeze([V3_TICK_TOPIC, 'turn/reply-parsed']),
      // 一次验证轮失败（票箱拒/回合失败）不该让 tick 停摆：失败以回执/journal 具名，候选下一 tick 继续。
      failure: 'open',
      capabilities: Object.freeze(['trigger-workflow', 'rewrite-result']),
      module: V3_VERIFY_MODULE,
    },
    {
      // P0-9/P0-6：数据面模块。它【不写记录】——tick 到期时重建一次索引视图（5s 节流，v3 `:2039`），
      // 让"索引"这条机制真的有消费者，而不是一对只被测试调用的纯函数。
      id: 'v3-dataplane',
      order: 120,
      on: Object.freeze([V3_TICK_TOPIC]),
      // 索引重建失败（例如某条记录读取抛错）不该让 tick 停摆；失败经总线审计具名，不静默。
      failure: 'open',
      capabilities: Object.freeze(['trigger-workflow']),
      module: V3_DATAPLANE_MODULE,
    },
    {
      // P0-8：人工门。order 125 = **最后**一个 tick 消费者：planner/verify 在本 tick 里决定"要不要开/等门"，
      // gates 随后看到"模式已经是 auto ⇒ 把 pending 一次放行"（放行执行器由 planner/verify 在开门时注册）。
      // 它只订阅 tick：判定/台账/放行都是被 planner/verify 调用的普通导出函数（不靠总线 decision）。
      id: 'v3-gates',
      order: 125,
      on: Object.freeze([V3_TICK_TOPIC]),
      // 放行失败不该让 tick 停摆：失败以终态（failed）写回同一条门记录，并在回执里逐条点名。
      failure: 'open',
      capabilities: Object.freeze(['trigger-workflow']),
      module: V3_GATES_MODULE,
    },
  ]),

  // P0-2 的规划器提示段。走**清单的 sections 通道**（晚注册，`vibe-math-vmu.js:997-1006`），原因见
  // `prompts/planner.js` 文件头：`prompts/sections.json` 的读取端会丢弃 `scope`，而这一段必须只对
  // `role='planner'` 的回合生效（否则求解器/验证器也会读到调度词表，违反提示词对账文档 §2.3 的 X9）。
  // order 落在 pack 区间 [600,899]，`range` 由 order 派生且已声明一致。
  sections: Object.freeze([V3_PLANNER_SECTION, ...V3_PROMPT_SECTIONS]),
})

export default PACK
