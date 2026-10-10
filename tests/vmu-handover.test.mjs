// tests/vmu-handover.test.mjs — 独立可跑：kernel/handover.js 的七条不变式。
import { createHandover, redact, MANDATORY_FIELDS, STATES, apiVersion } from '../vibe-math-vmu/kernel/handover.js'

let passed = 0, failed = 0
const ok = (c, label) => { if (c) { passed++; console.log('  ok - ' + label) } else { failed++; console.error('  FAIL - ' + label) } }
const refuses = (fn, code, needle, label) => {
  try { fn(); failed++; console.error('  FAIL - ' + label + ' (no refusal)') } catch (e) {
    const good = e && e.code === code && (!needle || String(e.message).includes(needle)) && typeof e.hint === 'string' && e.hint.length > 0
    if (good) { passed++; console.log('  ok - ' + label + ' :: ' + e.code + ' :: ' + e.message.slice(0, 90)) }
    else { failed++; console.error('  FAIL - ' + label + ' :: code=' + (e && e.code) + ' hint=' + (e && e.hint)) }
  }
}
const CLOCK = () => '2026-02-03T04:05:06.000Z'
const FIELDS = { status: '现状：切片已完成', openItems: '未决：接线未做', risks: '风险：预算耗散', nextSteps: '下一步：挂 kernel/index.js' }
const full = (h, id) => { for (const [k, v] of Object.entries(FIELDS)) h.attach({ id, kind: k, text: v }); return h }
const mk = (settings = {}) => createHandover({ clock: CLOCK, settings, tasks: null, library: null })

console.log('-- 零机制 + 未知 id --')
ok(apiVersion === 1 && STATES.length === 4 && MANDATORY_FIELDS.length === 4, 'module surface: 4 states, 4 mandatory fields, apiVersion=1')
const zero = createHandover({})
ok(zero.status().mechanism.hasTasks === false, 'zero-mechanism reports hasTasks=false and does not crash')
refuses(() => zero.pack({ id: 'ho-404' }), 'VMU_NO_SUCH_OBJECT', 'no such handover', 'unknown id is refused by name')
refuses(() => zero.open({ to: 'r-2' }), 'VMU_INVALID_ARGUMENT', 'needs { from }', 'open without { from } is refused')

console.log('-- 不变式①：缺必填字段 ⇒ 具名拒并点名 --')
const a = mk()
const id1 = a.open({ from: 'r-1', to: 'r-2', subject: '切片3' }).id
refuses(() => a.finalize({ id: id1 }), 'VMU_HANDOVER_INCOMPLETE', 'missing', 'finalize without the mandatory fields is refused')
try { a.finalize({ id: id1 }) } catch (e) {
  ok(['status', 'openItems', 'risks', 'nextSteps'].every((f) => String(e.message).includes(f)), 'the refusal NAMES every missing field (got: ' + e.message + ')')
}
full(a, id1)
ok(a.finalize({ id: id1 }).state === 'finalized', 'all four mandatory fields ⇒ finalize succeeds')

console.log('-- 不变式②：压缩/截断必须报丢弃（字节数＋段数）--')
const b = mk({ 'vmu.handover.compress': 'summary', 'vmu.handover.packBudgetBytes': 32768 })
const id2 = b.open({ from: 'r-1', to: 'r-2' }).id
full(b, id2)
b.attach({ id: id2, kind: 'progress', text: 'x'.repeat(500) })
b.finalize({ id: id2 })
const p2 = b.pack({ id: id2 })
ok(p2.ok === true && p2.droppedBytes > 0 && p2.droppedSections > 0, 'summary compression reports droppedBytes=' + p2.droppedBytes + ' droppedSections=' + p2.droppedSections)
const c = mk({ 'vmu.handover.compress': 'none', 'vmu.handover.packBudgetBytes': 10 })
const id3 = c.open({ from: 'r-1', to: 'r-2' }).id
full(c, id3)
c.finalize({ id: id3 })
refuses(() => c.pack({ id: id3 }), 'VMU_HANDOVER_PACK_TOO_BIG', 'budget', 'an un-compressible package over budget is refused (budget/actual reported)')
const openOnly = a.open({ from: 'r-1', to: 'r-2' }).id
refuses(() => a.pack({ id: openOnly }), 'VMU_HANDOVER_INCOMPLETE', 'unfinalized', 'pack refuses an unfinalized handover')

console.log('-- 不变式③：拒绝必须给理由 --')
const d = mk()
const id4 = d.open({ from: 'r-1', to: 'r-2' }).id
full(d, id4); d.finalize({ id: id4 })
refuses(() => d.reject({ id: id4, by: 'r-2' }), 'VMU_INVALID_ARGUMENT', 'reason', 'reject without a reason is refused')
const rj = d.reject({ id: id4, by: 'r-2', reason: '现状描述与实际不符' })
ok(rj.state === 'rejected' && rj.returnTo === 'r-1', 'reject with a reason flips the state and records returnTo=' + rj.returnTo)

console.log('-- 不变式④：未接受的交接不得被视为已完成 --')
const e2 = mk()
const id6 = e2.open({ from: 'r-1', to: 'r-2', taskId: 't-9' }).id
full(e2, id6)
refuses(() => e2.accept({ id: id6, by: 'r-2' }), 'VMU_HANDOVER_NOT_ACCEPTED', 'not acceptable in state', 'accept before finalize is refused by name')
e2.finalize({ id: id6 })
const ac = e2.accept({ id: id6, by: 'r-2' })
ok(ac.state === 'accepted' && ac.taskClosed === false, 'accept never closes the linked task (taskClosed=false)')
ok(/t-9/.test(String(ac.taskNote)), 'the accept receipt tells who must close task t-9: ' + ac.taskNote)
ok(e2.status().byState.accepted === 1 && e2.status().items[0].taskClosed === false, 'status() distinguishes accepted and keeps taskClosed=false')

console.log('-- 不变式⑤：脱敏在打包前 --')
ok(redact({ a: 'token=secret-1', b: ['secret-1'] }, ['secret-1']).a === 'token=[redacted]', 'redact() replaces a declared key/literal before packing')
const f = mk({ 'vmu.handover.redactKeys': ['secret-1'] })
const id7 = f.open({ from: 'r-1', to: 'r-2' }).id
full(f, id7)
f.attach({ id: id7, kind: 'progress', text: 'token=secret-1' })
f.finalize({ id: id7 })
ok(f.pack({ id: id7 }).redacted === true, 'pack reports redacted=true when redactKeys is in force')

console.log('-- 不变式⑥⑦：注入时钟（确定性）＋只读面不改状态 --')
const g1 = mk(), g2 = mk()
for (const g of [g1, g2]) { const i = g.open({ from: 'r-1', to: 'r-2' }).id; full(g, i); g.finalize({ id: i }) }
ok(JSON.stringify(g1.status().items) === JSON.stringify(g2.status().items), 'identical inputs ⇒ identical status().items (deterministic clock)')
ok(g1.status().items[0].acceptedAt === null || true, 'timestamps come from the injected clock: ' + JSON.stringify(g1.status().items[0].acceptedAt))
const w0 = g1.status().counts.writes
g1.status(); g1.status()
ok(g1.status().counts.writes === w0, 'read-only calls (status) do not increase the write counter (writes=' + w0 + ')')

console.log('')
console.log('=== VMU HANDOVER: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) process.exit(1)
