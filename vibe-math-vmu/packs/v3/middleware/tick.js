/**
 * packs/v3/middleware/tick.js — PHASE 6 / P0-1：v3 复刻的【周期驱动】tick 体（最小可用的一步）。
 *
 * 这一版只做一件事：调度器把一个 declared seed 变成总线主题 `v3/tick` 之后，往 `vmu.records` 的
 * `journal` 轨写一条记录，说明"这是第几次 tick、什么时间、间隔多少"。v3 的九步循环
 * （依赖同步→收口→优先级→晋升→验证补派→执行计划队列→规划→方法整理→汇报）属于 P0-2 及之后，
 * 本轮【不】在这里调用 `vmu.turn.run()`：那会撞上 K2 的重入守卫，且派发必须由调度 tick 驱动，
 * 不能在 turn 钩子里同步再开一个 turn。
 *
 * ★ 两条形状约束，都是本仓自己的规则，不是任意选择：
 *
 * ① `v3/tick` 是冻结集之外的【新钩子主题】。它必须在被 emit（以及被模块订阅）之前用
 *    `bus.declareTopic(name)` 声明（kernel/bus.js:605-622；docs/05 §6）。调度器在 fire() 里会补声明
 *    （kernel/scheduler.js:169-181），但那个时刻在【装载之后】—— 而 kernel/loader.js 在 load() 时用
 *    `isRegisteredHook()` 校验模块的 hooks（:54-61、:83-91），未声明 ⇒ 装载被具名拒，整包 apply 失败。
 *    所以声明必须发生在【本模块被 import 时】：`DECLARED_TOPICS` 是进程级的（kernel/bus.js:337-350），
 *    任何一次 `declareTopic` 都对所有 bus 实例可见，重复声明不是错误。这里用一个临时 bus 触碰那个进程级
 *    集合，然后丢弃它（声明本身就是全部副作用）。
 *
 * ② 读 `vmu.records` 必须声明 `trigger-workflow`。`api.services.get(name)` 是 loader 的能力门
 *    （kernel/loader.js:120-146）：没有该能力 ⇒ 具名拒；声明了但本装配没发布该服务 ⇒ 另一个具名拒。
 *    两向都不静默。
 *
 * 时间只来自注入的时钟：事件里的 `at` 是调度器 `clock()` 的值（scheduler.js:294-303），本模块不读
 * `Date.now()`；`vmu.v3.tickIntervalMs` 是声明式间隔（settings/schema.js），tick 体把它记进 journal，
 * 供 P0-2 的 tickDue 判定复用同一把键。
 */
import { isDeclaredTopic } from '../../../kernel/bus.js'
/** 本包声明的协议扩展主题。调度器 seed 的 `what` 就是它（settings/defaults.json）。 */
export const V3_TICK_TOPIC = 'v3/tick'

/**
 * 本模块订阅的主题在【装载前】就必须是已声明主题，理由见文件头 ①。
 * ★ PHASE 6（目标 3 审计 P1）：声明不再发生在 import 时（那会让"卸载后仍注册"成立，且进程级集合无法按包撤回）。
 * 现在由 pack 清单的 `topics` 字段在 `pack.js` 的 apply 里声明（owner=本包本次装载的 token），
 * 卸载 undo 只撤回本包的声明；`v3TickStatus().declared` 反映运行期真实状态。
 */

/** 模块内已处理过的 tick 次数（进程内；重启归零 —— 因此只用于自报，不当作持久计数）。 */
let tickCalls = 0
let lastTick = null

/** 只读自报，给测试与诊断用：调用次数、最后一次的 id/时间、主题是否真的已声明。 */
export function v3TickStatus() {
  return {
    topic: V3_TICK_TOPIC,
    declared: isDeclaredTopic(V3_TICK_TOPIC),
    declaredExisting: false, // PHASE 6: declaration is a pack-apply action now, so there is no import-time "already existed" fact
    declaredBy: 'pack apply (manifest topics field)',
    calls: tickCalls,
    last: lastTick === null ? null : Object.assign({}, lastTick),
  }
}

/** 把注入时钟的毫秒值转成可读时间；缺值时如实说"未知"，不编一个当前时间。 */
const atText = (at) => (Number.isFinite(at) ? new Date(at).toISOString() : 'unknown')

export const V3_TICK_MODULE = Object.freeze({
  meta: Object.freeze({ id: 'v3-tick', apiVersion: 1 }),
  // `trigger-workflow` 只解锁 api.services；没有它，services.get('vmu.records') 会按名拒绝。
  capabilities: Object.freeze(['trigger-workflow']),
  hooks: Object.freeze({
    [V3_TICK_TOPIC]: async (event) => {
      const flat = event && typeof event === 'object' ? event : {}
      const api = flat.api
      if (!api || !api.services) {
        // 走不到这里（loader 一定附上 api），但绝不假装成功：静默跳过会把"没写记录"伪装成"tick 成功"。
        // 这里不给自造错误码：本仓的码表是单一登记源（docs/03 §8.1 由代码扫描生成），一个未登记的码
        // 要么让文档门禁变红，要么就得改 docs/** —— 两者都不是本卡的落点。
        throw Object.assign(new Error('v3 tick received no api facade, so vmu.records cannot be reached'), {
          hint: 'a tick entry must go through kernel/loader.js (module shape), not the raw bus path',
        })
      }
      tickCalls += 1
      // 调度器给的序号是本 seed 的 run 次数（scheduler.js:293-303）；模块自报的次数另存，二者都不是持久计数。
      const run = Number.isInteger(flat.runs) ? flat.runs : null
      const at = Number.isFinite(flat.at) ? flat.at : null
      const intervalMs = Number(api.setting('vmu.v3.tickIntervalMs'))
      const records = api.services.get('vmu.records')
      const body = [
        '- tick: ' + (run === null ? 'unknown' : run),
        '- at: ' + atText(at) + (at === null ? '' : ' (' + at + 'ms, injected clock)'),
        '- topic: ' + V3_TICK_TOPIC,
        '- intervalMs: ' + (Number.isFinite(intervalMs) ? intervalMs : 'unknown'),
        '- triggerVia: ' + String(flat.triggerVia === undefined ? 'unknown' : flat.triggerVia),
        '- source: vmu.schedule.triggers seed (by=settings)',
      ].join('\n')
      const rec = records.put({
        track: 'journal',
        kind: 'state',
        title: 'v3 tick #' + (run === null ? tickCalls : run),
        body,
        // 一条 tick 日志在写入时就是【已结算】的事实记录；因此不需要把 requireSettledRecords 关掉（P0-4 才需要）。
        settled: true,
        by: V3_TICK_TOPIC,
      })
      lastTick = { run, at, intervalMs: Number.isFinite(intervalMs) ? intervalMs : null, recordId: rec && rec.id ? rec.id : null, call: tickCalls }
      // 非决策对象：bus 只把 DECISION_CAPABILITY 里的键当决策（kernel/bus.js:556-567），其余字段留给读者。
      return { ok: true, topic: V3_TICK_TOPIC, tick: lastTick.run, recordId: lastTick.recordId, call: tickCalls }
    },
  }),
})

export default V3_TICK_MODULE
