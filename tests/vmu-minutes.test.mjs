// tests/vmu-minutes.test.mjs — 独立可跑：kernel/minutes.js 的具名拒／截断计数／零机制／确定性／可追溯。
import { createMinutes, apiVersion, DETAIL_LEVELS, VERBATIM_CAP_BYTES } from '../vibe-math-vmu/kernel/minutes.js'

let passed = 0, failed = 0
const ok = (c, label) => { if (c) { passed++; console.log('  ok - ' + label) } else { failed++; console.error('  FAIL - ' + label) } }
const refuses = (fn, code, needle, label) => {
  try { fn(); failed++; console.error('  FAIL - ' + label + ' (no refusal)') } catch (e) {
    const good = e && e.code === code && (!needle || String(e.message).includes(needle)) && typeof e.hint === 'string' && e.hint.length > 0
    if (good) { passed++; console.log('  ok - ' + label + ' :: ' + e.code + ' :: ' + e.message.slice(0, 80)) }
    else { failed++; console.error('  FAIL - ' + label + ' :: code=' + (e && e.code) + ' hint=' + (e && e.hint)) }
  }
}
const CLOCK = () => '2026-01-02T03:04:05.000Z'          // 固定 clock ⇒ 确定性
const MEETING = { id: 'm-1', summary: () => ({ rounds: [1, 2, 3], inputs: [1, 2], silent: ['r-3'] }) }
const mk = (settings = {}, meeting = MEETING) => createMinutes({ clock: CLOCK, settings, meeting })

console.log('-- 零机制（无会议注入）: 具名拒且不崩 --')
ok(apiVersion === 1 && DETAIL_LEVELS.length === 3 && VERBATIM_CAP_BYTES > 0, 'module surface: apiVersion=1, 3 detail levels, a byte cap')
const zero = createMinutes({})
ok(zero.status().mechanism.hasMeeting === false, 'zero-mechanism status reports hasMeeting=false')
refuses(() => zero.draft({ meetingId: 'm-1' }), 'VMU_NO_OPEN_MEETING', 'zero-mechanism', 'draft without a meeting is refused by name (no crash)')

console.log('-- draft / 上次未确认 / 未知 id --')
const a = mk()
const d1 = a.draft({ meetingId: 'm-1' })
ok(d1.ok === true && /^mn-/.test(d1.id) && d1.detail === 'normal' && d1.at === CLOCK(), 'draft returns a deterministic id/at and the policy detail level')
const a2 = mk({ 'vmu.minutes.confirmPreviousRequired': true })
a2.draft({ meetingId: 'm-1' })
refuses(() => a2.draft({ meetingId: 'm-1' }), 'VMU_MINUTES_NOT_CONFIRMED', 'unconfirmed', 'a second draft is refused while the previous minutes is unconfirmed')
refuses(() => a0confirm(), 'VMU_NO_SUCH_OBJECT', 'no such minutes', 'unknown id is refused by name')
function a0confirm() { return mk().confirm({ id: 'mn-404', by: 'r-1' }) }
refuses(() => a.confirm({ id: d1.id }), 'VMU_INVALID_ARGUMENT', 'needs { by }', 'confirm without { by } is refused')

console.log('-- 决议缺行动项 ⇒ VMU_MINUTES_ACTION_REQUIRED（点名缺哪一项）--')
const b = mk({ 'vmu.minutes.actionsOwnerRequired': true, 'vmu.minutes.dueRequired': true })
const db = b.draft({ meetingId: 'm-1' })
refuses(() => b.confirm({ id: db.id, by: 'acad', actions: [{ text: 'fix it' }] }), 'VMU_MINUTES_ACTION_REQUIRED', 'missing owner+due', 'an action without owner/due is refused, naming what is missing')
const c1 = b.confirm({ id: db.id, by: 'acad', actions: [{ text: 'fix it', who: 'r-2', due: '2026-01-09' }] })
ok(c1.ok === true && !!c1.confirmedAt && !!c1.fingerprint, 'a complete action list confirms and yields a fingerprint')

console.log('-- 异议强制 ⇒ VMU_MINUTES_DISSENT_REQUIRED --')
const c = mk({ 'vmu.minutes.dissentMandatory': true })
const dc = c.draft({ meetingId: 'm-1' })
refuses(() => c.confirm({ id: dc.id, by: 'acad' }), 'VMU_MINUTES_DISSENT_REQUIRED', 'dissent', 'an empty dissent section is refused under the mandatory policy')
const dcm = c.confirm({ id: dc.id, by: 'acad', dissent: ['r-3: 不同意（仅记录）'] })
ok(dcm.ok === true, 'an explicit dissent entry satisfies the policy')

console.log('-- 截断：报丢弃字节数（绝不静默）--')
const e = mk({ 'vmu.minutes.verbatimCapBytes': 400 })   // 400B：首条(~271B)可入，第二条触界
const de = e.draft({ meetingId: 'm-1' })
const long = 'x'.repeat(200)
const ap1 = e.append({ id: de.id, text: long })
const ap2 = e.append({ id: de.id, text: long })
ok(ap1.appended === true && ap1.droppedBytes === 0 && ap1.entries === 1, 'a fitting verbatim entry is appended (entries=' + ap1.entries + ')')
ok(ap2.appended === false && ap2.droppedBytes > 0 && ap2.reason === 'verbatim-cap', 'overflow is truncated AND reports droppedBytes=' + ap2.droppedBytes + ' (never silent)')
ok(e.status().dropped === ap2.droppedBytes, 'status().dropped exposes the same dropped byte count')

console.log('-- 只读方法不得改状态 --')
const f = mk()
const df = f.draft({ meetingId: 'm-1' })
const before = JSON.stringify({ list: f.list(), st: f.status() })
f.actions({ id: df.id }); f.list(); f.status()
const after = JSON.stringify({ list: f.list(), st: f.status() })
ok(before.split('"writes"')[1].split(',')[0] === after.split('"writes"')[1].split(',')[0], 'read-only calls do not increase the write counter')
ok(f.status().counts.writes === 1, 'exactly one write so far (the draft): writes=' + f.status().counts.writes)

console.log('-- 确定性（同一 clock ⇒ 同一结果）--')
const g1 = mk(); const g2 = mk()
g1.draft({ meetingId: 'm-1' }); g2.draft({ meetingId: 'm-1' })
ok(JSON.stringify(g1.list()) === JSON.stringify(g2.list()), 'two identical instances produce identical list() output')
ok(g1.status().mechanism.clockInjected === true, 'status states the clock is injected (no real time is read)')

console.log('-- 确认后可追溯 --')
const h = mk()
const dh = h.draft({ meetingId: 'm-1', detail: 'full' })
h.confirm({ id: dh.id, by: 'acad', actions: [{ text: 'follow up', who: 'r-1', due: '2026-01-10' }] })
const st = h.status(), li = h.list()
ok(st.confirmed === 1 && li.items[0].confirmedAt === CLOCK() && li.items[0].actions === 1, 'confirmed minutes are traceable from status()+list()')
ok(h.actions({ id: dh.id }).actions[0].who === 'r-1', 'actions({id}) returns a COPY of the recorded action (read-only)')

console.log('')
console.log('=== VMU MINUTES: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) process.exit(1)
