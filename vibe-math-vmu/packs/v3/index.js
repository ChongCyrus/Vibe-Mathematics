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
 *     **构造期快照**）＋ middleware/dataplane.js（三卡 compose/parse、正文段保留、有界写入与 dropped 计数、
 *     索引重建与坏卡点名、Verified 分裂、tick 驱动的 5s 节流索引）。
 *   · P0-6 软规范三卡 ＋ Verified 分裂 —— dataplane.js 的 compose/rewrite/promoteVerified ＋
 *     prompts/sections.json 的"可信分层"段（段文本是数据；插件在建内核前按目录名读它）。
 *
 * ★ 值层判据（P0-1 踩过、P0-9 又踩一次会一样的坑）：读点在 createKernel 之前/构造中 ⇒ 只能写
 *   `settings/defaults.json`。`vmu.records.tracks/allowedKinds/requireSettledRecords/bodyCapBytes/
 *   head.maxItems` 在 `kernel/records.js:189-221` 被**快照一次**，写进清单 `settings` 会**永远读不到且不报错**。
 *
 * ★ 为什么【没有】manifest 的 `tracks:` 字段（清单 §4 曾建议 v3 扩 tracks）：`kernel/pack.js:479-482` 对
 *   manifest `tracks` 调的是 `kernel.declareTracks()`，它**重建 library** 且第一行 `mustLibrary()` 在无
 *   `root` 的装配上**具名拒**（kernel/index.js:1871-1877）⇒ 加了它，没工作区的部署会在 apply 期拿到 pack 错误；
 *   而且它喂的是 `kernel.library`，**不是** vmu.records 的构造期快照 ⇒ 轨仍然写不进去。轨的唯一生效处是值层。
 *
 * 还没有落的东西（属于 P0-2…P0-10，不要在本文件里提前声明）：planner/methods/verify/gates 模块、slots
 * （v3 的 planner/solver/verifier）、任何 M1 规则（v3 的规则需要计数与状态，是代码不是 DSL）。
 */
import { V3_TICK_MODULE, V3_TICK_TOPIC } from './middleware/tick.js'
import { V3_DATAPLANE_MODULE } from './middleware/dataplane.js'

export const PACK = Object.freeze({
  id: 'v3',
  version: '0.2.0',
  packContractVersion: 1,
  description: 'v3 复刻包（PHASE 6）：P0-1 周期驱动 + P0-9 数据面（轨/卡/索引/持久）+ P0-6 软规范三卡与 Verified 分裂。与 packs/v3-core 互斥装载；不是行为等价证明。',

  // 两个模块在运行期通过 loader 的能力门读 `vmu.records`（kernel/index.js 的 middleware 服务目录里有这个面）。
  // 在装载期就把依赖声明出来：缺它应当在 apply 时具名拒，而不是等第一次 tick 才炸。
  requires: [{ service: 'vmu.records', minVersion: 1 }],

  // ★ 故意【为空】：构造期读取的值一律在 settings/defaults.json（见文件头）。同一键若两处都写，
  // pack.js 会按 O4 判"重叠"并具名拒（它并不会有第二个答案）。
  settings: Object.freeze({}),

  // v3 的规则是定量+有状态的（"至少 N 名验证者"、"manual 下不许跑"），M1 的谓词 DSL 表达不了 ⇒ 与 v3-core 一致：
  // P0 不引入 M1。tick/dataplane 也不需要规则。
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
  ]),
})

export default PACK
