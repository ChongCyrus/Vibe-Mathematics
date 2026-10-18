// tests/vmu-v3-tick.test.mjs — PHASE 6 / P0-1：v3 复刻的第一块（周期驱动）。
//
// 这张卡要证明的不是"写了一个 middleware"，而是三件【会失败】的事：
//
//   ① 默认值必须落在 settings/defaults.json（值层），不能落在被装载清单的 settings 里。
//      调度器的种子与 autoArm 是【构造期】读取（kernel/scheduler.js:96-114、kernel/index.js:878-887），
//      而清单的 settings 要等装载后才 apply（kernel/pack.js:428-470）⇒ 写错地方【不会报错】，
//      只是"安安静静地不跑"。这里直接从 defaults.json 读值来建内核，并在 §2 断言清单里【没有】这些键。
//   ② 注入 timer 后，声明式 seed 真的按墙钟推进调度循环：手工触发一次假 timer 回调 ⇒ tick 体被调用【1】次，
//      并且真的在 vmu.records 的 journal 轨留下一条记录。
//   ③ 不注入 timer 时【不许假装】：timerShape 为 null、autoArm 为 false，且构造期留下的是
//      VMU_CONTROL_NO_TIMER 这条具名拒 —— 而不是"看起来武装了"。
//
// 时钟是注入的：假 timer 回调触发前把时钟推到 seed 的到期时刻（真机上由墙钟完成这件事）。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { createPackLoader } from '../vibe-math-vmu/kernel/pack.js'
import { isDeclaredTopic } from '../vibe-math-vmu/kernel/bus.js'
import { isRegisteredHook } from '../vibe-math-vmu/kernel/loader.js'
import { SETTING_DEFS } from '../vibe-math-vmu/settings/schema.js'
import { PACK } from '../vibe-math-vmu/packs/v3/index.js'
import { V3_TICK_MODULE, V3_TICK_TOPIC, v3TickStatus } from '../vibe-math-vmu/packs/v3/middleware/tick.js'
import { pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULTS_FILE = join(HERE, '..', 'vibe-math-vmu', 'packs', 'v3', 'settings', 'defaults.json')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

/** The declared settings the pack folds in BEFORE the kernel exists — read the real file, not a copy. */
const PACK_DEFAULTS = (() => {
  const parsed = JSON.parse(readFileSync(DEFAULTS_FILE, 'utf8'))
  return parsed && typeof parsed.defaults === 'object' && parsed.defaults ? parsed.defaults : {}
})()

/** A controllable host timer in the `{ setTimeout, clearTimeout }` shape scheduler.timerShape accepts. */
const makeTimer = () => {
  const pending = []
  const timer = {
    setTimeout(fn, ms) { const handle = { fn, ms }; pending.push(handle); return handle },
    clearTimeout(handle) { const i = pending.indexOf(handle); if (i < 0) return false; pending.splice(i, 1); return true },
  }
  return {
    timer,
    pending,
    fireNext() {
      const handle = pending[0]
      if (!handle || typeof handle.fn !== 'function') return false
      handle.fn()
      const i = pending.indexOf(handle)
      if (i >= 0) pending.splice(i, 1)
      return true
    },
  }
}

const cloneDefaults = () => JSON.parse(JSON.stringify(PACK_DEFAULTS))

console.log('=== 1. settings/defaults.json 是【值层】，且值就是 P0-1 需要的那些 ===')
{
  ok(PACK_DEFAULTS['vmu.schedule.autoArm'] === true, 'autoArm 在值层为 true（schema 的默认是 false：包表达偏好）', PACK_DEFAULTS['vmu.schedule.autoArm'])
  ok(PACK_DEFAULTS['vmu.schedule.timeSource'] === 'host-timer', 'timeSource 在值层为 host-timer', PACK_DEFAULTS['vmu.schedule.timeSource'])
  ok(PACK_DEFAULTS['vmu.schedule.triggerVia'] === 'middleware', 'triggerVia 在值层为 middleware（否则只报告不触发）', PACK_DEFAULTS['vmu.schedule.triggerVia'])
  const seeds = PACK_DEFAULTS['vmu.schedule.triggers']
  ok(Array.isArray(seeds) && seeds.length === 1, '恰好一条声明式种子', seeds)
  const seed = Array.isArray(seeds) ? seeds[0] : null
  ok(seed && seed.kind === 'every' && seed.intervalMs === 2000 && seed.what === V3_TICK_TOPIC && seed.by === 'settings',
    '种子是 every / 2000ms / v3/tick / by=settings', seed)
  ok(seed && seed.payload && seed.payload.phase === 'tick', '种子带 payload.phase=tick（P0-2 的相位词汇从这里来）', seed && seed.payload)
  ok(PACK_DEFAULTS['vmu.v3.tickIntervalMs'] === 2000, 'vmu.v3.tickIntervalMs=2000（tick 体读它并写进 journal）', PACK_DEFAULTS['vmu.v3.tickIntervalMs'])
  const tracks = PACK_DEFAULTS['vmu.records.tracks']
  ok(Array.isArray(tracks) && tracks.includes('journal'), 'vmu.records.tracks 在值层包含 journal（否则记录写入会被具名拒）', tracks)
  // ★ typo guard: a defaults.json key that is not declared in settings/schema.js would fail silently.
  const declared = new Set(SETTING_DEFS.map((d) => d.key))
  const undeclared = Object.keys(PACK_DEFAULTS).filter((k) => !declared.has(k))
  ok(undeclared.length === 0, 'defaults.json 的每一把键都已在 settings/schema.js 声明（拼错不会静默）', undeclared)
}

console.log('=== 2. 清单只声明调用期的东西：构造期的键【不在】PACK.settings（否则永远读不到） ===')
{
  ok(PACK && PACK.id === 'v3', 'PACK.id 是 v3', PACK && PACK.id)
  ok(PACK.settings && Object.keys(PACK.settings).length === 0,
    'PACK.settings 为空：构造期键必须只存在于 defaults.json（同键两处会被 O4 判重叠）', PACK.settings)
  const constructionKeys = ['vmu.schedule.autoArm', 'vmu.schedule.timeSource', 'vmu.schedule.triggerVia', 'vmu.schedule.triggers', 'vmu.v3.tickIntervalMs', 'vmu.records.tracks']
  const duplicated = constructionKeys.filter((k) => Object.prototype.hasOwnProperty.call(PACK.settings, k))
  ok(duplicated.length === 0, '没有任何构造期键同时出现在清单 settings 里', duplicated)
  const entries = Array.isArray(PACK.middleware) ? PACK.middleware : []
  // ★ CHANGED IN ROUND 10 (Lead ruling, at v3-dataplane's request): this used to assert `entries.length === 1`, i.e.
  // "the manifest carries exactly one middleware entry". That was never the requirement - the requirement is that P0-1
  // contributes exactly ONE TICK entry. The stricter form would have forbidden the pack from ever growing a second
  // module, which is what P0-9 legitimately needed (an index rebuilder on a 5s throttle), so it was enforcing a
  // counting accident rather than a contract. Narrowing it keeps the original intent and stops the assertion from
  // becoming a veto on the next card.
  ok(entries.filter((e) => e && e.id === 'v3-tick').length === 1,
    '清单恰好携带一个 tick middleware 条目（P0-1 的契约；其它条目属其它卡，不由本卡计数）',
    entries.map((e) => e && e.id))
  const entry = entries.find((e) => e && e.id === 'v3-tick') || {}
  ok(entry.id === 'v3-tick', '条目 id 是 v3-tick', entry.id)
  ok(Array.isArray(entry.on) && entry.on.includes(V3_TICK_TOPIC), '条目订阅 v3/tick', entry.on)
  ok(entry.module === V3_TICK_MODULE, '条目携带 module 对象（loader 才会附上 api；file: 不可用，因为 pack 调 toBusEntries 不传 importer）', typeof entry.module)
  ok(typeof entry.handler !== 'function', '条目不是 inline handler（inline 形状拿不到 api）', typeof entry.handler)
  ok(entry.kind === undefined, '条目故意省略 kind：pack.js 默认按 module 处理，而 bus 的静态校验会拒"带 kind 却没 handler"的原始条目', entry.kind)
  ok(entry.capabilities.includes('trigger-workflow'), '条目声明 trigger-workflow（解锁 api.services 的能力名）', entry.capabilities)
  ok(Array.isArray(V3_TICK_MODULE.capabilities) && V3_TICK_MODULE.capabilities.includes('trigger-workflow'), '模块自身也声明 trigger-workflow（loader 读的是模块的声明）', V3_TICK_MODULE.capabilities)
  ok(V3_TICK_MODULE.meta && Number.isInteger(V3_TICK_MODULE.meta.apiVersion), '模块带 meta.apiVersion（loader 的硬门槛）', V3_TICK_MODULE.meta)
  ok(V3_TICK_MODULE.hooks && typeof V3_TICK_MODULE.hooks[V3_TICK_TOPIC] === 'function', '模块的 hooks 里真的有 v3/tick 处理器', Object.keys(V3_TICK_MODULE.hooks || {}))
}

console.log('=== 3. v3/tick 的声明是【apply 的动作】，不是 import 的副作用（P1：卸载可撤销） ===')
{
  ok(V3_TICK_TOPIC === 'v3/tick', '主题名是 v3/tick', V3_TICK_TOPIC)
  // PHASE 6 (goal-3 audit P1): this used to be true HERE because tick.js declared on a throwaway bus at import time -
  // and that process-wide declaration could never be retracted, so an unloaded pack stayed "registered". Now the pack
  // manifest declares the topic and pack.js declares it at APPLY (owner-tracked), so before apply it is NOT registered.
  ok(isDeclaredTopic(V3_TICK_TOPIC) === false, '装载前它【未】被声明（声明发生在 apply，而不是 import 的副作用）', V3_TICK_TOPIC)
  ok(isRegisteredHook(V3_TICK_TOPIC) === false, '因此 loader 在装载前也【不】认它（不会再有"卸载后仍注册"）', V3_TICK_TOPIC)
}

console.log('=== 4. 正向：注入 timer + autoArm + 种子 ⇒ 手工触发一次假 timer ⇒ tick 体被调用 1 次 ===')
{
  let clockMs = 1000
  const clock = () => clockMs
  const { timer, pending, fireNext } = makeTimer()
  const kernel = createKernel({ clock, settings: cloneDefaults(), timer })
  const loader = createPackLoader({ kernel, registry: kernel.registry })
  const applied = await loader.apply(PACK)
  ok(applied && applied.ok === true, 'v3 包装载干净（module 形状经 loader 成功装载）', applied && { applied: applied.applied, actions: applied.actions && applied.actions.length })
  // PHASE 6 (P1): the manifest's topics field is what makes v3/tick registered, and it happens at THIS point.
  ok(isDeclaredTopic(V3_TICK_TOPIC) === true && isRegisteredHook(V3_TICK_TOPIC) === true,
    'apply 之后 v3/tick 才被声明并成为可订阅钩子（pack 清单 topics 字段 ⇒ pack.js declareTopic）', V3_TICK_TOPIC)

  const before = v3TickStatus()
  ok(before.calls === 0, '触发前 tick 体一次都没被调用', before.calls)

  const sched = kernel.scheduler.status()
  ok(sched.timerShape === 'setTimeout/clearTimeout', '公开读面承认了注入的 timer 形状', sched.timerShape)
  ok(sched.autoArm === true, '自驱已武装（autoArm=true）', sched.autoArm)
  ok(kernel.status().seams.scheduleAutoArm === true, 'kernel.status().seams.scheduleAutoArm 也是 true（不是两套说法）', kernel.status().seams.scheduleAutoArm)
  ok(pending.length === 1 && pending[0].ms === 2000, '声明式种子真的把注入 timer 武装了，且延时是 2000ms', pending.map((h) => h.ms))

  // 真机上墙钟会走到 seed 的到期时刻；假 timer 由测试推进注入时钟。
  clockMs = 3000
  ok(fireNext() === true, '手工触发了一次假 timer 回调', pending.length)
  // bus.emit 是 async（scheduler 不 await 它），让一个宏任务过去再断言。
  await new Promise((resolve) => setImmediate(resolve))

  const after = v3TickStatus()
  ok(after.calls === 1, '★ tick 体被调用【1】次（不多不少）', after.calls)
  ok(after.last && after.last.run === 1, 'tick 记录的是这个 seed 的第 1 次 run', after.last)
  ok(after.last && after.last.intervalMs === 2000, 'tick 体读到的间隔是声明式的 2000', after.last && after.last.intervalMs)

  const schedAfter = kernel.scheduler.status()
  ok(schedAfter.ticks.fired === 1, '调度器自己计数 fired=1（到达的是一条真钩子）', schedAfter.ticks.fired)
  ok(schedAfter.autoRearms >= 1, '触发后重新武装：周期是真的"周期"，不是一次性', schedAfter.autoRearms)
  ok(schedAfter.timerHandles === 1, '下一次到期已有一个新 timer 句柄', schedAfter.timerHandles)

  // ★ 落盘面：tick 真的写了一步，不是只返回 ok
  const records = kernel.records
  const list = records.list({ track: 'journal' })
  ok(list.available === 1 && list.items.length === 1, 'journal 轨上恰好一条记录', { available: list.available })
  ok(list.items[0] && list.items[0].kind === 'state', '记录的 kind 是 state（journal 轨上的允许 kind）', list.items[0] && list.items[0].kind)
  const got = records.get({ id: list.items[0].id })
  ok(typeof got.body === 'string' && /- tick: 1/.test(got.body), '记录正文说明这是第几次 tick', got.body && got.body.split('\n').slice(0, 2))
  ok(/- at: /.test(got.body) && /1970-01-01T00:00:03/.test(got.body), '记录正文带注入时钟给出的时间（不是 Date.now）', got.body && got.body.split('\n')[1])
  ok(/- intervalMs: 2000/.test(got.body), '记录正文带声明式间隔', {})
  ok(kernel.records.status().caps.tracks.includes('journal'), 'journal 是内核 records 面承认的一条轨', kernel.records.status().caps.tracks)
}

console.log('=== 5. 反向：不注入 timer ⇒ 不假装（timerShape=null、autoArm=false、具名拒） ===')
{
  const clock = () => 1000
  const kernel = createKernel({ clock, settings: cloneDefaults() })
  const sched = kernel.scheduler.status()
  ok(sched.timerShape === null, 'timerShape 是 null（没有 seam 就是没有）', sched.timerShape)
  ok(sched.autoArm === false, 'autoArm 是 false（没有任何自驱在跑）', sched.autoArm)
  ok(sched.timerInjected === false, 'timerInjected 也是 false', sched.timerInjected)
  const seams = kernel.status().seams
  ok(seams.scheduleAutoArm === false, 'kernel.status().seams.scheduleAutoArm=false', seams.scheduleAutoArm)
  ok(seams.scheduleDrive && seams.scheduleDrive.mode === 'refused' && seams.scheduleDrive.code === 'VMU_CONTROL_NO_TIMER',
    '声明的 timeSource=host-timer 却没有 seam ⇒ 构造期留下具名拒 VMU_CONTROL_NO_TIMER，而不是安静降级', seams.scheduleDrive)
  ok(sched.items.pending === 1, '种子仍在 pending：拒绝的是"自驱"，不是把声明式工作丢掉', sched.items.pending)
  ok(sched.tickPasses === 0, '一次 tick 都没跑过', sched.tickPasses)
}

console.log('=== 6. 对照：有 timer 但 autoArm=false ⇒ 不武装（机制来自声明，不是来自接缝的存在） ===')
{
  const { timer, pending } = makeTimer()
  const settings = Object.assign(cloneDefaults(), { 'vmu.schedule.autoArm': false })
  const kernel = createKernel({ clock: () => 1000, settings, timer })
  const sched = kernel.scheduler.status()
  ok(sched.timerShape === 'setTimeout/clearTimeout', 'timer 接缝在（不是"没有 timer"这条分支）', sched.timerShape)
  ok(sched.autoArm === false, 'autoArm=false 时不武装', sched.autoArm)
  ok(pending.length === 0, '没有任何 timer 句柄被创建（零机制：声明才动）', pending.length)
  ok(sched.items.pending === 1, '种子在那里等着，只是没人驱动它', sched.items.pending)
}

console.log('=== 7. 装配路径（真机那一半）：config.packs=[v3] ⇒ defaults 折在内核之前 + 装配注入平台 timer ===')
// 这一节回答 P0-1 的最后一道缺口：内核接受 timer 接缝、K1 也有 autoArm，但"装配建内核时传不传 timer"是
// vibe-math-vmu.js 的事。清单 §0 把这一处记为缺口；本测试在【真实入口】上验证它现在真的补上了，而不是只在
// createKernel 的单测里成立。它也顺带证明 defaults.json 是在构造内核【之前】被折进去的（否则 autoArm 读取为 false）。
{
  const ENTRY = join(HERE, '..', 'vibe-math-vmu', 'vibe-math-vmu.js')
  const entry = await import(pathToFileURL(ENTRY).href)
  const hostState = { specs: [], effects: [] }
  const ctx = {
    effect(fn, label) { hostState.effects.push(label); return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { hostState.specs.push(spec); return () => {} } },
  }
  let entryClockMs = 1000
  const handle = entry.apply(ctx, { clock: () => entryClockMs, packs: ['v3'] })
  await handle.ready()
  ok(handle.packErrors().length === 0, '真实入口装载 packs=[v3] 无错（清单 settings 为空，不产生冲突）', handle.packErrors())
  ok(handle.appliedPacks().some((p) => p.id === 'v3'), 'pack v3 被记为已应用', handle.appliedPacks().map((p) => p.id))
  // ★ 构造前折入：settingsSnapshot 是内核构造时拿到的值，里面已有 pack 的 autoArm=true。
  ok(handle.kernel.settingsSnapshot()['vmu.schedule.autoArm'] === true,
    '★ defaults.json 在【建内核之前】被折入（内核看到的 autoArm 已是 true）', handle.kernel.settingsSnapshot()['vmu.schedule.autoArm'])
  const sched = handle.kernel.scheduler.status()
  ok(sched.timerShape === 'setTimeout/clearTimeout',
    '★ 装配真的注入了平台 timer（不再是"K1 已落但装配没传 timer"⇒ tick-only）', sched.timerShape)
  ok(sched.autoArm === true, '★ 真机路径上自驱已武装', sched.autoArm)
  ok(sched.items.pending === 1 && sched.timerHandles === 1, '一条 seed 在 pending，并已持有一个 timer 句柄', { pending: sched.items.pending, handles: sched.timerHandles })
  const seams = handle.kernel.status().seams
  ok(seams.scheduleAutoArm === true && seams.scheduleDrive && seams.scheduleDrive.mode === 'armed',
    'status().seams.scheduleDrive 记录的是 armed（不是 refused / tick-only）', seams.scheduleDrive)
  const busEntries = handle.kernel.bus.entries().map((e) => e.id + ':' + (e.on || []).join('|'))
  ok(busEntries.some((x) => x.startsWith('v3-tick:') && x.includes(V3_TICK_TOPIC)), 'tick 模块经真实 pack 路径挂上了总线', busEntries)

  const beforeEntryTick = v3TickStatus().calls
  entryClockMs = 3000
  const receipt = handle.kernel.scheduler.tick({ at: 3000 })
  ok(receipt && receipt.firedCount === 1, '在装配出来的内核上手工 tick 一次，seed 真的到期并被触发', receipt && { fired: receipt.firedCount, skipped: receipt.skippedCount })
  await new Promise((resolve) => setImmediate(resolve))
  ok(v3TickStatus().calls === beforeEntryTick + 1, '同一个 tick 体在真实装配路径上被调用一次', { before: beforeEntryTick, after: v3TickStatus().calls })
  ok(handle.kernel.records.list({ track: 'journal' }).available === 1, '真实装配路径上 journal 记录也写成了', handle.kernel.records.list({ track: 'journal' }).available)
  for (const cleanup of handle.cleanups || []) { try { cleanup() } catch { /* unwind is the host's job */ } }
}

console.log('')
console.log('=== V3 TICK (P0-1): ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length > 0) for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)
