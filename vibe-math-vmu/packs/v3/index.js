/**
 * THE v3 PACK FOLDER (PHASE 6 · goal 2)：把 `vibe-math-v3` 的机制复刻成 vmu 的一个整合包。
 *
 * ★ 本包与 `packs/v3-core/` 是【互斥装载】的两个机构（部署二选一，docs/acceptance/
 *   phase6-v3-p0-build-checklist.md §3）：v3-core 是"机构外壳"的近似示范（它自己也写着 NOT v3、不是行为等价
 *   证明），v3 是把 v3 的运转机制真正落成 pack 的那一个。本文件是【本轮 P0-1】的全部清单面。
 *
 * 本轮的落点只有三样：
 *   · settings/defaults.json —— 【值层】：构造期就被读取的值（schedule 的四个键 + tickIntervalMs +
 *     records 的轨）。写进本文件的 `settings` 会【永远读不到】，因为清单的 settings 是装载后才 apply
 *     （kernel/pack.js:428-470），而调度器 / records 在 createKernel 的构造期就把它们读走了
 *     （kernel/index.js:878-887、kernel/scheduler.js:96-114、kernel/records.js:189-221）。
 *   · middleware/tick.js —— tick 体：订阅 `v3/tick`，写一条 `journal` 记录（P0-1 的最小可用一步）。
 *   · README.md —— 这个文件夹是什么、诚实边界在哪。
 *
 * 还没有落的东西（属于 P0-2…P0-10，不要在本文件里提前声明）：planner/dataplane/methods/verify/gates 模块、
 * prompts/sections.json、slots（v3 的 planner/solver/verifier）、tracks（P0-9 的 dataplane 才需要 library 面）、
 * 任何 M1 规则（v3 的规则需要计数与状态，是代码不是 DSL）。
 */
import { V3_TICK_MODULE, V3_TICK_TOPIC } from './middleware/tick.js'

export const PACK = Object.freeze({
  id: 'v3',
  version: '0.1.0',
  packContractVersion: 1,
  description: 'v3 复刻包（PHASE 6）：P0-1 只落周期驱动 —— 一个按墙钟推进的 v3/tick，tick 体写一条 journal 记录。与 packs/v3-core 互斥装载；不是行为等价证明。',

  // 本包的 tick 模块在运行期通过 loader 的能力门读 `vmu.records`（kernel/index.js 的 middleware 服务目录里
  // 有这个面）。在装载期就把依赖声明出来：缺它应当在 apply 时具名拒，而不是等第一次 tick 才炸。
  requires: [{ service: 'vmu.records', minVersion: 1 }],

  // ★ 故意【为空】：构造期读取的值一律在 settings/defaults.json（见文件头）。同一键若两处都写，
  // pack.js 会按 O4 判"重叠"并具名拒（它并不会有第二个答案）。
  settings: Object.freeze({}),

  // v3 的规则是定量+有状态的（"至少 N 名验证者"、"manual 下不许跑"），M1 的谓词 DSL 表达不了 ⇒ 与 v3-core 一致：
  // 本轮不引入 M1。tick 也不需要规则。
  rules: Object.freeze([]),

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
  ]),
})

export default PACK
