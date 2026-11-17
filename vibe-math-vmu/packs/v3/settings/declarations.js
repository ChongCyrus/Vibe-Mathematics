// v3 pack — ITS OWN SETTINGS NAMESPACE (C#3 / TB-2792 Step 1b).
//
// WHY THIS FILE EXISTS: a pack may own a settings namespace (docs/10 §4). The framework table holds FRAMEWORK keys only;
// this file declares the pack's keys through the ONE registration seam (settings/schema.js registerPackSettings), so adding
// a pack setting key needs NO framework edit. The framework still VALIDATES and MERGES the values through the same path as
// every framework key, and an unknown namespace is refused by name (VMU_SETTING_NAMESPACE_UNKNOWN).
import { registerPackSettings, HOT } from '../../../settings/schema.js'

export const DEFS = [
  { key: 'vmu.v3.tickIntervalMs', type: 'natural', def: 2000, hot: HOT.H1, who: 'office', doc: 'v3 复刻：周期扫描的墙钟间隔（v3 `tickIntervalMs:2000`，`vibe-math-v3.js:400`）。读者＝`packs/v3/settings/defaults.json` 的 `v3/tick` 种子 ＋ `packs/v3/middleware/tick.js` 的到期判定。 ★ capability-default: 这不是框架政策，而是【v3 复刻包的机构选择值】（原始 vibe-math-v3 的默认），读者是 packs/v3/middleware/*；把它当框架默认看会误判，所以按本门禁的具名标记登记' },
  { key: 'vmu.v3.planningHorizon', type: 'natural', def: 3, hot: HOT.H1, who: 'office', doc: 'v3 复刻：一次计划最多保留多少个可执行动作（超出截断且计数）。读者＝`packs/v3/middleware/planner.js`。 ★ capability-default: 这不是框架政策，而是【v3 复刻包的机构选择值】（原始 vibe-math-v3 的默认），读者是 packs/v3/middleware/*；把它当框架默认看会误判，所以按本门禁的具名标记登记' },
  { key: 'vmu.v3.plannerEnabled', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: 'v3 复刻：规划器总开关；连续 `plannerMaxFails` 次不可解析 ⇒ 自动置 false 并发出具名事件（绝不静默）。读者＝`packs/v3/middleware/planner.js`。 ★ capability-default: 这不是框架政策，而是【v3 复刻包的机构选择值】（原始 vibe-math-v3 的默认），读者是 packs/v3/middleware/*；把它当框架默认看会误判，所以按本门禁的具名标记登记' },
  { key: 'vmu.v3.planMinIntervalMs', type: 'natural', def: 30000, hot: HOT.H1, who: 'office', doc: 'v3 复刻：两次规划之间的最小间隔（冷却）。读者＝`packs/v3/middleware/planner.js`。 ★ capability-default: 这不是框架政策，而是【v3 复刻包的机构选择值】（原始 vibe-math-v3 的默认），读者是 packs/v3/middleware/*；把它当框架默认看会误判，所以按本门禁的具名标记登记' },
  { key: 'vmu.v3.plannerMaxQueuedTurns', type: 'number', def: 2, hot: HOT.H1, who: 'office', doc: 'v3 规划器：串行派发队列里同时存在的回合数达到该值就不再派新回合（防止模型慢/卡时把队列越堆越长）；队头已等待超过 vmu.turn.deliveryTimeoutMs 时同样停止派发' },
{ key: 'vmu.v3.plannerMaxFails', type: 'natural', def: 3, hot: HOT.H1, who: 'office', doc: 'v3 复刻：连续不可解析多少次后关闭规划器。读者＝`packs/v3/middleware/planner.js`。 ★ capability-default: 这不是框架政策，而是【v3 复刻包的机构选择值】（原始 vibe-math-v3 的默认），读者是 packs/v3/middleware/*；把它当框架默认看会误判，所以按本门禁的具名标记登记' },
  { key: 'vmu.v3.methodKeepEvery', type: 'positiveInteger', def: 5, hot: HOT.H1, who: 'office', doc: 'v3 复刻：方法库每 N 个应用记录保留一次归档。读者＝`packs/v3/middleware/methods.js`。 ★ capability-default: 这不是框架政策，而是【v3 复刻包的机构选择值】（原始 vibe-math-v3 的默认），读者是 packs/v3/middleware/*；把它当框架默认看会误判，所以按本门禁的具名标记登记' },
  { key: 'vmu.v3.methodKeepIntervalMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: 'v3 复刻：方法库按时间的保留间隔（0＝只按次数）。读者＝`packs/v3/middleware/methods.js`。' },
  { key: 'vmu.v3.methodAutoPromote', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: 'v3 复刻：方法是否自动晋升（默认 false＝须人工/规则放行）。读者＝`packs/v3/middleware/methods.js`。' },
  { key: 'vmu.v3.debateMaxRounds', type: 'natural', def: 5, hot: HOT.H1, who: 'office', doc: 'v3 复刻：验证辩论的最大轮次。读者＝`packs/v3/middleware/verify.js`。 ★ capability-default: 这不是框架政策，而是【v3 复刻包的机构选择值】（原始 vibe-math-v3 的默认），读者是 packs/v3/middleware/*；把它当框架默认看会误判，所以按本门禁的具名标记登记' },
  { key: 'vmu.v3.paperCloseTarget', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: 'v3 复刻：论文收口目标 id；非空时 tick 里检查四件产物，缺件不宣称完成，必要时派 paper-writer 回合。读者＝`packs/v3/middleware/paper-close.js` ✓' },
  { key: 'vmu.v3.toolAllow', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: 'v3 复刻：允许的宿主工具名白名单（空＝零策略）；非空时名单外/拿不到工具名 ⇒ 具名拒。读者＝`packs/v3/middleware/toolfilter.js` ✓' },
  { key: 'vmu.v3.toolDeny', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: 'v3 复刻：禁止的宿主工具名黑名单（优先于 allow）；读者同上 ✓' },
  { key: 'vmu.v3.reportMode', type: 'enum', domain: ['file', 'push', 'both'], def: 'file', hot: HOT.H1, who: 'office', doc: 'v3 复刻：汇报三路模式（file＝写 reports 轨快照；push＝经 vmu.report 投递；both＝两者）。读者＝`packs/v3/middleware/reports.js` ✓' },
  { key: 'vmu.v3.reportIntervalMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: 'v3 复刻：汇报节流毫秒；0＝每个 tick 一次；>0 未到点具名 report-not-due。读者＝`packs/v3/middleware/reports.js` ✓' },
  { key: 'vmu.v3.promoteValueThreshold', type: 'number', def: 0.7, hot: HOT.H1, who: 'office', doc: 'v3 复刻：命题「价值/关键性」 ≥ 该值且未定论时自动晋升为问题（每 tick 至多一个）。读者＝`packs/v3/middleware/planner.js`；范围 [0,1]，越界/NaN 回落 0.7 ✓' },
  { key: 'vmu.v3.verdictMode', type: 'enum', domain: ['forced', 'natural'], def: 'forced', hot: HOT.H1, who: 'office', doc: 'v3 复刻：连续概率票如何折叠成裁决（forced＝夹到 [0.01,0.99] 后按阈值；natural＝原值）。读者＝`packs/v3/middleware/verify.js`。 ★ capability-default: 这不是框架政策，而是【v3 复刻包的机构选择值】（原始 vibe-math-v3 的默认），读者是 packs/v3/middleware/*；把它当框架默认看会误判，所以按本门禁的具名标记登记' },
]

export const REGISTRATION = registerPackSettings({ pack: "v3", namespace: "vmu.v3", defs: DEFS })

export default DEFS
