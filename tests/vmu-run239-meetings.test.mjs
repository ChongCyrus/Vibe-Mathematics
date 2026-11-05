#!/usr/bin/env node
/**
 * tests/vmu-run239-meetings.test.mjs — RUN 239-D / FEEDBACK62 #5·#9：会议两个读面的字段集对齐 + 议程条目。
 *
 * WHAT THIS PINS (每条断言自带它需要的前提):
 *  §1 「谁发了言」是一个事实，却只在一扇门上存在：`vibe_vmu_meeting {action:"status"}`（meetingView）带
 *     `spokeBy`/`spokeByMeans`，`summary()` 不带 —— 而 summary 带齐了左右的计数（speeches/turnsAccounted/
 *     turnsUnattributed）。缺席读起来像「没人发言」，其实只是「这扇门不说」。现在两扇门都 spread 同一个
 *     `spokeBlockOf(m)`，并且 `omittedKeys` 必须存在且为空（空 = 断言「没有一面在裁剪」），`omittedMeans` 说明为什么
 *     空着 —— 想丢键的面必须把键名列进 omittedKeys 并给理由。
 *  §2 `speak()` 回执与 `summary()` 同源：受理之后本成员已在 minutes 的 speech 条目里，所以回执的 spokeBy 必须包含
 *     他本人（此前回执根本没有 spokeBy，只能再读一次会议）。
 *  §3 `close()` 回执与返回、以及关闭后的 `summary()`（archive 行）同源；关闭不会重置「谁发过言」。
 *  §4 议程有两个名字、没有条目：pack 的参数叫 `agenda`，内核字段叫 `materials`，读面回显成一整串无名文本。
 *     现在 `agenda`/`materials` 同值同解释，`agendaItems` 是同一串按写入面自己用的分隔符（`;` `；` `、` `,` 换行）
 *     切开、去空白、保序；`agendaItemsMeans`/`materialsMeans` 各说清自己是什么。
 *  §5 逐条正式议程：内核没有人写 `formalAgenda`（pack 的 `formal_agenda` 是布尔），所以正常会议是 `null` + 一句
 *     「null 是没有条目清单，不是空议程」；真带数组时（另一写入方存进 fold 的行）拆成 `{index,id,text}`，空文本丢弃、
 *     顺序保留、`index` 是它在记录里的位置。
 *  §6 两个读面对这一族键的字段集必须相同，且 M8 的三个数（turns/turnsAccounted/turnsUnattributed）仍然相等。
 *
 * Run: node tests/vmu-run239-meetings.test.mjs   (targeted only)
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed++; console.log('  ok   ' + name) }
  else { failed++; failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}
const has = (text, needle, name) => ok(typeof text === 'string' && text.includes(needle), name, typeof text === 'string' ? text.slice(0, 200) : text)
const countIn = (src, needle) => src.split(needle).length - 1

/* ── kernel harness: the shape tests/vmu-run236-meeting-readings.test.mjs uses ───────────────────────────────── */
let NOW = 1000
const rec = (vals) => ({ get: (k) => (vals || {})[k] })
const mk = (settings = {}) => {
  NOW = 1000
  return createMeetings({
    clock: () => NOW,
    settings: rec(Object.assign({ 'vmu.meetings.quorumCap': 0 }, settings)),
    log: () => {},
  })
}
const MEET = { type: 'ordinary', chair: 'acad', roster: ['acad', 'r-1', 'r-2'] }
const AGENDA = 'item one; item two、item three, item four\nitem five'
const SPOKE_FAMILY = ['speeches', 'speechesMeans', 'turnsAccounted', 'turnsUnattributed', 'turnsUnattributedMeans',
  'spokeBy', 'spokeByCount', 'spokeByMeans', 'omittedKeys', 'omittedMeans']
const AGENDA_FAMILY = ['agenda', 'agendaItems', 'agendaItemsMeans', 'materials', 'materialsMeans',
  'formalAgendaItems', 'formalAgendaItemsMeans']

/* ── §0: the fixture pins the SOURCE, so a future re-inlining cannot pass by accident ─────────────────────── */
console.log('=== 0. the two read faces are built from ONE projection (source pin) ===')
{
  const here = dirname(fileURLToPath(import.meta.url))
  const src = await readFile(join(here, '..', 'vibe-math-vmu', 'kernel', 'meetings.js'), 'utf8')
  ok(countIn(src, 'const spokeByOf = (m)') === 1 && countIn(src, 'const spokeBlockOf = (m)') === 1,
    '★ the who-spoke family has exactly ONE builder (`spokeByOf` + `spokeBlockOf`)', { by: countIn(src, 'const spokeByOf = (m)'), block: countIn(src, 'const spokeBlockOf = (m)') })
  ok(countIn(src, 'const SPOKE_BY_MEANS') === 1, '★ the sentence explaining `spokeBy` is defined once, not per face')
  ok(countIn(src, 'speechesOf(m)') === 1, '★★ the faces SPREAD the block instead of re-listing `speeches` (before, summary and the view each listed it)',
    { occurrences: countIn(src, 'speechesOf(m)') })
  ok(countIn(src, '...spokeBlockOf(m)') === 6,
    '★★ the projection is spread on SIX faces: summary, status view, speak receipt+return, close receipt+return',
    { spreads: countIn(src, '...spokeBlockOf(m)') })
  ok(countIn(src, '...agendaBlockOf(m)') === 2 && countIn(src, 'const agendaBlockOf = (m)') === 1,
    '★ the agenda block is built once and spread on both read faces', { spreads: countIn(src, '...agendaBlockOf(m)') })
  ok(countIn(src, 'const AGENDA_ITEM_SEPARATORS = /[;；、,\\n]/') === 1, '★ the split uses the separators the write face itself joins with (; ； 、 , newline)')
  ok(countIn(src, 'omittedKeys: []') === 1, '★ `omittedKeys: []` is the assertion "no face prunes"; a face that must drop a key has to name it')
}

/* ── §1: spokeBy on BOTH read faces, same value, same sentence ─────────────────────────────────────────────── */
console.log('\n=== 1. "who debated" is one fact, readable through BOTH doors ===')
{
  const t = mk({})
  const o = t.open(Object.assign({}, MEET, { materials: AGENDA }))
  t.attend({ meeting: o.meeting, member: 'r-1' })
  t.attend({ meeting: o.meeting, member: 'r-2' })
  const s1 = t.speak({ meeting: o.meeting, member: 'r-2', text: 'second one' })
  const s2 = t.speak({ meeting: o.meeting, member: 'r-1', text: 'first one' })
  ok(s1.ok === true && s2.ok === true, 'premise: two speeches are accepted (r-2 first, then r-1)', { a: s1.ok, b: s2.ok })

  const sum = t.summary({ meeting: o.meeting })
  const view = t.meetingView({ meeting: o.meeting })
  ok(Array.isArray(sum.spokeBy) && sum.spokeBy.join(',') === 'r-2,r-1',
    '★★ summary() names WHO spoke, in the order they first spoke (it had every count but not this)', sum && sum.spokeBy)
  ok(typeof sum.spokeByMeans === 'string' && sum.spokeByMeans.includes('at least one recorded speech'),
    '★ summary explains what spokeBy means instead of leaving the reader to guess', sum && sum.spokeByMeans)
  ok(sum.spokeByCount === 2 && sum.spokeByCount === sum.spokeBy.length, '★ spokeByCount is the length of the same list, not a second count', { count: sum.spokeByCount })
  ok(Array.isArray(view.spokeBy) && view.spokeBy.join(',') === sum.spokeBy.join(','),
    '★★ the status view reads the SAME list (the two doors cannot disagree)', { sum: sum.spokeBy, view: view.spokeBy })
  ok(view.spokeByMeans === sum.spokeByMeans, '★ and the same sentence explains it on both faces')
  ok(Array.isArray(sum.omittedKeys) && sum.omittedKeys.length === 0,
    '★★ summary claims it omits NOTHING from the family (an empty list is the claim)', sum && sum.omittedKeys)
  has(sum.omittedMeans, 'both spread THIS block', '★★ …and the sentence says both faces spread one block, so the claim is checkable')
  has(sum.omittedMeans, 'omittedKeys', '★ …and names the escape hatch a pruning face must use')
  ok(Array.isArray(view.omittedKeys) && view.omittedKeys.length === 0, '★ the status view makes the same claim', view && view.omittedKeys)
  ok(sum.speeches === 2 && sum.turnsAccounted === 2 && sum.turnsUnattributed === 0,
    'premise (M8 unchanged): two accepted speeches = speeches 2, accounted 2, nothing unattributed',
    { speeches: sum.speeches, accounted: sum.turnsAccounted, unattributed: sum.turnsUnattributed })
}

/* ── §2: the SPEAK receipt carries the same block, and it includes the speaker who just spoke ──────────────── */
console.log('\n=== 2. a speak receipt reads the same list (and includes the speaker himself) ===')
{
  const t = mk({})
  const o = t.open(MEET)
  t.attend({ meeting: o.meeting, member: 'r-1' })
  t.attend({ meeting: o.meeting, member: 'r-2' })
  const s = t.speak({ meeting: o.meeting, member: 'r-1', text: 'the only speech' })
  ok(s.ok === true, 'premise: the speech is accepted', s && s.ok)
  ok(Array.isArray(s.spokeBy) && s.spokeBy.join(',') === 'r-1',
    '★★ the ACCEPTING speak receipt now names who has spoken, and it includes this member (minutes already has the entry)',
    { spokeBy: s.spokeBy })
  ok(s.receipt && Array.isArray(s.receipt.spokeBy) && s.receipt.spokeBy.join(',') === 'r-1',
    '★ the recorded receipt carries the same list (a receipt is a read face too)', s && s.receipt && s.receipt.spokeBy)
  ok(s.receipt && s.receipt.spokeByMeans === t.summary({ meeting: o.meeting }).spokeByMeans,
    '★ …with the same sentence summary() uses (one wording, not two)')
  ok(Array.isArray(s.omittedKeys) && s.omittedKeys.length === 0, '★ the speak receipt makes the same "omits nothing" claim too', s && s.omittedKeys)
}

/* ── §3: close receipt / return / post-close summary all agree ─────────────────────────────────────────────── */
console.log('\n=== 3. close() reads the same list, before and after the closure ===')
{
  const t = mk({})
  const o = t.open(MEET)
  t.attend({ meeting: o.meeting, member: 'r-1' })
  t.attend({ meeting: o.meeting, member: 'r-2' })
  t.speak({ meeting: o.meeting, member: 'r-1', text: 'one' })
  t.speak({ meeting: o.meeting, member: 'r-2', text: 'two' })
  const before = t.summary({ meeting: o.meeting }).spokeBy.slice()
  const c = t.close({ meeting: o.meeting, report: 'closed for the test' })
  ok(c.ok === true, 'premise: the meeting closes', c && c.ok)
  ok(Array.isArray(c.spokeBy) && c.spokeBy.join(',') === before.join(','),
    '★★ the close receipt names who spoke (it used to carry turns but not the members)', { receipt: c.spokeBy, before })
  ok(c.receipt && Array.isArray(c.receipt.spokeBy) && c.receipt.spokeBy.join(',') === before.join(','),
    '★ the recorded close receipt carries the same list', c && c.receipt && c.receipt.spokeBy)
  const after = t.summary({ meeting: o.meeting })
  ok(Array.isArray(after.spokeBy) && after.spokeBy.join(',') === before.join(','),
    '★★ the closed (archived) summary reads the SAME speakers — closing does not reset who debated', { after: after.spokeBy, before })
  ok(after.omittedKeys.length === 0, '★ the archived row makes the same "omits nothing" claim')
}

/* ── §4: agenda under both names + its items ──────────────────────────────────────────────────────────────── */
console.log('\n=== 4. `agenda` and `materials` are one value, and its items are readable ===')
{
  const t = mk({})
  const o = t.open(Object.assign({}, MEET, { materials: AGENDA }))
  const sum = t.summary({ meeting: o.meeting })
  const view = t.meetingView({ meeting: o.meeting })
  ok(sum.agenda === AGENDA && sum.materials === AGENDA,
    '★★ BOTH names carry the SAME agenda string (the second name is for readers already parsing `materials`)', { agenda: sum.agenda, materials: sum.materials })
  ok(sum.agendaItems.length === 5 && sum.agendaItems.join('|') === 'item one|item two|item three|item four|item five',
    '★★ the stored one-line agenda is readable as its ITEMS (split on ; ； 、 , and newline, trimmed, order kept)', sum && sum.agendaItems)
  ok(sum.agendaItems.every((x) => x === x.trim() && x !== ''), '★ no item keeps surrounding whitespace and no empty item is emitted')
  has(sum.agendaItemsMeans, 'order preserved', '★ agendaItems says how it was derived (a reading of the string, not a second record)')
  has(sum.materialsMeans, 'agenda', '★★ materialsMeans says plainly that `materials` IS the agenda — a reader of the old name is not missing a fact')
  ok(view.agenda === sum.agenda && view.agendaItems.join('|') === sum.agendaItems.join('|'),
    '★★ the status view reads the SAME agenda and the SAME items', { agenda: view.agenda, items: view.agendaItems })

  const n = mk({})
  const on = n.open(MEET)
  const empty = n.summary({ meeting: on.meeting })
  ok(empty.agenda === null && empty.materials === null && empty.agendaItems.length === 0,
    '★ a meeting with no agenda reads null/[] (absence stays absence, not a fake empty item)', { agenda: empty.agenda, items: empty.agendaItems })
}

/* ── §5: per-item formal agenda: null on a normal meeting, split when a writer stored one ──────────────────── */
console.log('\n=== 5. a per-item flat agenda is split when it exists, and its absence is EXPLAINED ===')
{
  const t = mk({})
  const o = t.open(MEET)
  const sum = t.summary({ meeting: o.meeting })
  ok(sum.formalAgendaItems === null, 'premise: no writer stored a per-item agenda here, so the field is null', sum && sum.formalAgendaItems)
  has(sum.formalAgendaItemsMeans, 'BOOLEAN', '★★ the sentence says WHY: the pack\'s `formal_agenda` is a boolean flag, not an item list')
  has(sum.formalAgendaItemsMeans, 'NOT an empty agenda', '★★ …and that null means "no item list", not "no agenda"')

  // A row another writer stored (the fold is shared) may carry the items: the read face must split them.
  const raw = JSON.parse(String(t.snapshot().data.live))
  raw.__map[0][1].formalAgenda = [{ id: 'ag-1', text: 'item one' }, { text: '   ' }, 'item two']
  const snap = Object.assign({}, t.snapshot(), { data: Object.assign({}, t.snapshot().data, { live: JSON.stringify(raw) }) })
  const f = mk({})
  const r = f.restore(snap)
  ok(r.ok === true, 'premise: the synthetic stored row hydrates into a fresh instance', r && r.restored)
  const fs = f.summary({ meeting: o.meeting })
  ok(Array.isArray(fs.formalAgendaItems) && fs.formalAgendaItems.length === 2,
    '★★ a stored per-item agenda is split into items (the blank entry is dropped)', fs && fs.formalAgendaItems)
  ok(fs.formalAgendaItems[0].index === 0 && fs.formalAgendaItems[0].id === 'ag-1' && fs.formalAgendaItems[0].text === 'item one',
    '★★ each item is `{index,id,text}` — position, recorded id, trimmed text', fs.formalAgendaItems[0])
  ok(fs.formalAgendaItems[1].index === 2 && fs.formalAgendaItems[1].id === null && fs.formalAgendaItems[1].text === 'item two',
    '★ `index` is the item\'s position in the RECORDED list (dropping the blank does not renumber) and a bare string has id null', fs.formalAgendaItems[1])
  has(fs.formalAgendaItemsMeans, 'point at an item by position or by id', '★ the sentence says how to use index/id')
}

/* ── §6: field-set parity of the family + M8 numbers still agree ──────────────────────────────────────────── */
console.log('\n=== 6. the two read faces carry the SAME key set for these families ===')
{
  const t = mk({})
  const o = t.open(Object.assign({}, MEET, { materials: 'a; b' }))
  t.attend({ meeting: o.meeting, member: 'r-1' })
  t.speak({ meeting: o.meeting, member: 'r-1', text: 'x' })
  const sum = t.summary({ meeting: o.meeting })
  const view = t.meetingView({ meeting: o.meeting })
  const missingOnSummary = SPOKE_FAMILY.concat(AGENDA_FAMILY).filter((k) => !Object.prototype.hasOwnProperty.call(sum, k))
  const missingOnView = SPOKE_FAMILY.concat(AGENDA_FAMILY).filter((k) => !Object.prototype.hasOwnProperty.call(view, k))
  ok(missingOnSummary.length === 0, '★★ summary() carries every key of both families (spokeBy was the missing one)', missingOnSummary)
  ok(missingOnView.length === 0, '★★ the status view carries every key of both families too', missingOnView)
  ok(sum.turns === view.turns && sum.turnsAccounted === view.turnsAccounted && sum.turnsUnattributed === view.turnsUnattributed,
    '★★ M8 (unchanged): the three reconciled numbers are equal on both faces',
    { sum: [sum.turns, sum.turnsAccounted, sum.turnsUnattributed], view: [view.turns, view.turnsAccounted, view.turnsUnattributed] })
  ok(Array.isArray(sum.speechesMeans) === false && typeof sum.speechesMeans === 'string', 'premise: the speech sentence is still a string')
}

/* ════════════════════════ B series: waiters / event wake ════════════════════════ */
const mkWith = (settings, extra) => {
  NOW = 1000
  return createMeetings(Object.assign({
    clock: () => NOW,
    settings: rec(Object.assign({ 'vmu.meetings.quorumCap': 0 }, settings)),
    log: () => {},
  }, extra))
}
const WAIT_UNTIL_ALL = ['speak', 'vote', 'motion', 'poll', 'phase', 'attend-all', 'hand', 'deadline', 'meeting-closed']

console.log('\n=== 7. source pins: one waiters vocabulary, ONE settle hinge, BOTH read faces ===')
{
  const src = await readFile(join(dirname(fileURLToPath(import.meta.url)), '..', 'vibe-math-vmu', 'kernel', 'meetings.js'), 'utf8')
  has(src, "Object.freeze(['speak', 'vote', 'motion', 'poll', 'phase', 'attend-all', 'hand', 'deadline', 'meeting-closed'])",
    '★ WAIT_UNTIL_MODES lists all nine events (the refusal names them, so the list is the contract)')
  has(src, 'const settleReceipt = (m, event, now, receipt)', '★ the ONE hinge: settle then push, so a receipt cannot fire waiters and not say so')
  ok(countIn(src, 'settleReceipt(m, ') === 12, '★★ every event point settles waiters through the same call (11 events + close)', countIn(src, 'settleReceipt(m, '))
  ok(countIn(src, '...waitersBlockOf(m)') === 2, '★★ summary() and the status view spread the SAME waiters block', countIn(src, '...waitersBlockOf(m)'))
  has(src, 'const WAIT_MEANS = ', 'premise: waitMeans is a declared sentence, not an inline string')
  has(src, 'END YOUR TURN', '★ the registration sentence tells the caller the turn may END (a wait is not a poll)')
  has(src, 'do not spin', '★ and says not to spin on it')
  has(src, 'const expireWaiters = (m, now) =>', 'premise: deadlines have their own sweep (sweepDue calls it)')
  has(src, 'cancelArmedWaiters(m, now, ', 'premise: close cancels what is still armed (a closed meeting wakes nobody later)')
}

console.log('\n=== 8. wait(): armed, replaced, both refusals, unwait ===')
{
  const t = mk({})
  const o = t.open(Object.assign({}, MEET))
  const mid = o.meeting
  const w1 = t.wait({ meeting: mid, member: 'r-1', until: 'speak' })
  ok(w1.ok === true && w1.armed === true, '★★ wait() arms a durable row and says so', w1.armed)
  ok(w1.waiter.state === 'armed' && w1.waiter.until === 'speak' && w1.waiter.member === 'r-1', '★★ the row names the member and the EVENT it waits for', w1.waiter)
  ok(w1.waiter.deadlineAt === null, 'no timeoutMs => no deadline (the event or a close ends it, nothing else)', w1.waiter.deadlineAt)
  ok(w1.receipt.firedWaiters === undefined && w1.waiters.length === 1, 'arming is NOT an event: the wait receipt has no firedWaiters, the meeting holds one row', { fw: w1.receipt.firedWaiters, n: w1.waiters.length })
  has(w1.waitMeans, 'END YOUR TURN', '★ waitMeans = the caller may end the turn (the whole point of registering)')
  has(w1.waitMeans, 'do not spin', '★ ...and that silence means the event has not happened, not that it should poll')
  has(w1.waitMeans, 'REPLACES', '★ re-registering replaces (one member waits for one thing at a time)')
  const w2 = t.wait({ meeting: mid, member: 'r-1', until: 'vote', timeoutMs: 5000 })
  ok(w2.replaced === true && w2.replacedWaiter.state === 'cancelled' && w2.replacedWaiter.cancelledBy === 'replaced',
    '★★ a second registration for the same member REPLACES the first (old row cancelled, and it says why)', w2.replacedWaiter)
  ok(w2.waiter.deadlineAt === 1000 + 5000, 'timeoutMs is recorded as an absolute deadline on the row', w2.waiter.deadlineAt)
  const sum = t.summary({ meeting: mid })
  ok(sum.waiters.length === 2 && sum.waitersArmed === 1 && sum.waitersCancelled === 1,
    '★★ the read face counts the states instead of leaving the caller to scan', { a: sum.waitersArmed, c: sum.waitersCancelled })
  const bad = (() => { try { t.wait({ meeting: mid, member: 'r-2', until: 'sideways' }); return null } catch (e) { return e } })()
  ok(bad !== null && bad.code === 'VMU_INVALID_ARGUMENT', '★★ an unknown until is refused BY NAME, not silently coerced to speak', bad && bad.code)
  has(bad && bad.message, 'unknown until', 'the refusal names the bad value')
  for (const v of WAIT_UNTIL_ALL) has(bad && bad.message, v, '★ the refusal lists the legal value ' + v)
  has(bad && bad.hint, 'until names the EVENT', 'the hint says what until MEANS instead of only what went wrong')
  const badMs = (() => { try { t.wait({ meeting: mid, member: 'r-2', until: 'speak', timeoutMs: 0 }); return null } catch (e) { return e } })()
  ok(badMs !== null && badMs.code === 'VMU_INVALID_ARGUMENT', '★★ a non-positive timeoutMs is refused by name (a 0 deadline would expire instantly)', badMs && badMs.code)
  has(badMs && badMs.message, 'timeoutMs must be a positive finite number', 'the timeout refusal names the field and the rule')
  const uw = t.unwait({ meeting: mid, member: 'r-1' })
  ok(uw.cancelled === true && uw.waiter.state === 'cancelled' && uw.waiter.cancelledBy === 'r-1',
    '★★ unwait() withdraws an armed row and records WHO withdrew it', uw.waiter && { s: uw.waiter.state, b: uw.waiter.cancelledBy })
  has(uw.unwaitMeans, 'will NOT be woken', 'the cancelling sentence says the member will not be woken any more')
  const uw2 = t.unwait({ meeting: mid, member: 'r-1' })
  ok(uw2.cancelled === false, '★★ unwait() with nothing armed is ok:true + cancelled:false (not a silent success)', uw2.cancelled)
  has(uw2.unwaitMeans, 'nothing was cancelled', 'and says nothing was cancelled instead of leaving it to be guessed')
}

console.log('\n=== 9. the hinge: a speak fires the wait, wakes the member, and the receipt says so ===')
{
  const wakes = []
  const t = mkWith({}, { wake: (a) => { wakes.push(a); return { ok: true, woken: true } } })
  const o = t.open(Object.assign({}, MEET))
  const mid = o.meeting
  t.attend({ meeting: mid, member: 'r-1' })
  t.attend({ meeting: mid, member: 'r-2' })
  t.wait({ meeting: mid, member: 'r-2', until: 'speak' })
  const sp = t.speak({ meeting: mid, member: 'r-1', text: 'opening' })
  const fired = sp.receipt.firedWaiters
  ok(Array.isArray(fired) && fired.length === 1, '★★ the event fired exactly the waiter that was armed', fired)
  if (Array.isArray(fired) && fired.length === 1) {
    ok(fired[0].member === 'r-2' && fired[0].until === 'speak' && typeof fired[0].id === 'string', '★★ the fired row names member / until / id', fired[0])
    ok(fired[0].wake && fired[0].wake.delivered === true && fired[0].wake.via === 'seam', '★★★ the member was WOKEN through the injected seam, and the delivery is recorded', fired[0].wake)
  }
  ok(wakes.length === 1 && wakes[0].member === 'r-2' && wakes[0].event === 'speak' && wakes[0].meeting === mid,
    '★★★ the seam was actually called, with the meeting + the event (the wake is not just prose)', wakes)
  has(sp.receipt.firedWaitersMeans, 'NEVER rolled back', '★ the means says a failed wake never undoes the academic act')
  ok(sp.receipt.turns === 1, 'premise (M8 unchanged): the speech still counts as a turn', sp.receipt.turns)
  const sum = t.summary({ meeting: mid })
  const view = t.meetingView({ meeting: mid })
  ok(sum.waiters.length === 1 && sum.waiters[0].state === 'fired' && sum.waitersFired === 1, '★★ the read face reads the row as fired', sum.waiters)
  ok(JSON.stringify(sum.waiters) === JSON.stringify(view.waiters), '★★ both read faces carry the SAME rows', { s: sum.waiters.length, v: view.waiters.length })
  has(sum.waitersMeans, 'DELIVERY fact', '★★ waitersMeans says fired is a delivery fact, not "the member acted"')
  for (const s of ['armed', 'fired', 'expired', 'cancelled']) has(sum.waitersMeans, '"' + s + '"', '★ waitersMeans defines the state ' + s)
  has(sum.waitersBecause, 'waitStates', '★ the face says waitStates (where a person stands) and waiters (which event wakes it) are two facts')
}

console.log('\n=== 10. every event name can actually fire: hand / motion / second / phase / poll / attend-all ===')
{
  const t = mkWith({}, { wake: () => ({ ok: true }) })
  const o = t.open(Object.assign({}, MEET))
  const mid = o.meeting
  t.attend({ meeting: mid, member: 'r-1' })
  t.attend({ meeting: mid, member: 'r-2' })
  t.wait({ meeting: mid, member: 'acad', until: 'hand' })
  const q = t.queue({ meeting: mid, member: 'r-1' })
  ok(q.receipt.firedWaiters.length === 1 && q.receipt.firedWaiters[0].until === 'hand', '★★ until:"hand" fires when a member asks for the floor', q.receipt.firedWaiters)
  t.wait({ meeting: mid, member: 'acad', until: 'motion' })
  const mo = t.motion({ meeting: mid, member: 'r-1', text: 'move' })
  ok(mo.receipt.firedWaiters.length === 1 && mo.receipt.firedWaiters[0].until === 'motion', '★★ until:"motion" fires on motion()', mo.receipt.firedWaiters)
  t.wait({ meeting: mid, member: 'acad', until: 'motion' })
  const se = t.second({ meeting: mid, motion: mo.motion, member: 'r-2' })
  ok(se.receipt.firedWaiters.length === 1 && se.receipt.firedWaiters[0].until === 'motion', '★★ ...and on second() too (a second is a motion event)', se.receipt.firedWaiters)
  t.wait({ meeting: mid, member: 'acad', until: 'phase' })
  const rc = t.recess({ meeting: mid, ms: 60000 })
  ok(rc.receipt.firedWaiters.length === 1 && rc.receipt.firedWaiters[0].until === 'phase', '★★ until:"phase" fires when the meeting phase moves (recess)', rc.receipt.firedWaiters)
  t.wait({ meeting: mid, member: 'acad', until: 'poll' })
  const vo = t.vote({ meeting: mid, member: 'r-2', motion: mo.motion, value: 1 })
  ok(vo.receipt.firedWaiters.length === 1 && vo.receipt.firedWaiters[0].member === 'acad', '★★ until:"poll" fires when a vote is counted (a ballot poll surfaces as a vote)', vo.receipt.firedWaiters)

  const t2 = mkWith({}, { wake: () => ({ ok: true }) })
  const o2 = t2.open(Object.assign({}, MEET))
  const m2 = o2.meeting
  t2.wait({ meeting: m2, member: 'acad', until: 'attend-all' })
  const a1 = t2.attend({ meeting: m2, member: 'r-1' })
  ok(a1.receipt.firedWaiters.length === 0, '★★ until:"attend-all" does NOT fire while a roster member is still missing', a1.receipt.firedWaiters.length)
  const a2 = t2.attend({ meeting: m2, member: 'r-2' })
  ok(a2.receipt.firedWaiters.length === 1 && a2.receipt.firedWaiters[0].member === 'acad', '★★★ ...and fires on the arrival that completes the roster', a2.receipt.firedWaiters)
}

console.log('\n=== 11. close(): meeting-closed fires, and what is still armed is cancelled ===')
{
  const t = mkWith({}, { wake: () => ({ ok: true }) })
  const o = t.open(Object.assign({}, MEET))
  const mid = o.meeting
  t.attend({ meeting: mid, member: 'r-1' })
  t.wait({ meeting: mid, member: 'r-1', until: 'meeting-closed' })
  t.wait({ meeting: mid, member: 'r-2', until: 'speak' })
  const cl = t.close({ meeting: mid })
  const fired = cl.receipt.firedWaiters
  ok(fired.length === 1 && fired[0].member === 'r-1' && fired[0].until === 'meeting-closed', '★★★ until:"meeting-closed" fires on close', fired)
  ok(cl.receipt.waitersCancelledByClose === 1, '★★ the wait that could never happen is cancelled, not left armed forever', cl.receipt.waitersCancelledByClose)
  const sum = t.summary({ meeting: mid })
  ok(sum.waitersArmed === 0, '★★ after close no waiter is still armed', sum.waitersArmed)
  const cancelled = sum.waiters.filter((w) => w.state === 'cancelled')
  ok(cancelled.length === 1 && typeof cancelled[0].cancelledWhy === 'string' && cancelled[0].cancelledWhy.includes('closed'),
    '★★ ...and the cancelled row says WHY (the meeting closed before the event)', cancelled[0] && cancelled[0].cancelledWhy)
}

console.log('\n=== 12. the deadline has a clock: sweepDue expires a waiter and wakes it under "deadline" ===')
{
  const t = mkWith({}, { wake: (a) => ({ ok: true, woken: true, at: a.at }) })
  const o = t.open(Object.assign({}, MEET))
  const mid = o.meeting
  t.wait({ meeting: mid, member: 'r-1', until: 'hand', timeoutMs: 2000 })
  const early = t.sweepDue({ at: 2000 })
  ok(early.expiredWaitersCount === 0, '★★ the sweep does not expire a waiter whose deadline has not elapsed', early.expiredWaitersCount)
  has(early.note, 'no waiter deadline elapsed', '★ ...and says so (an empty result is not silent)')
  const late = t.sweepDue({ at: 5000 })
  ok(late.expiredWaitersCount === 1, '★★★ a waiter deadline IS observed by the same sweep (a wait is not a hope)', late.expiredWaitersCount)
  const row = late.expiredWaiters[0]
  ok(row.member === 'r-1' && row.until === 'hand', '★★ the expired row names the member and the event it never got', row)
  ok(row.wake && row.wake.delivered === true, '★★★ expiring WAKES the member (event "deadline") instead of leaving it to wait forever', row.wake)
  has(late.expiredWaitersMeans, 'did NOT happen', '★ the means says the EVENT did not happen, the deadline did')
  const sum = t.summary({ meeting: mid })
  ok(sum.waiters[0].state === 'expired' && sum.waiters[0].firedBy === 'deadline' && sum.waitersExpired === 1,
    '★★ the read face reads expired/firedBy=deadline (distinguishable from fired)', { s: sum.waiters[0] && sum.waiters[0].state, b: sum.waiters[0] && sum.waiters[0].firedBy })
}

console.log('\n=== 13. a failed wake is a DELIVERY fact, never a reason to roll the event back ===')
{
  const t = mkWith({ 'vmu.meetings.wakeFailurePolicy': 'skip' }, { wake: () => ({ ok: false, error: 'no such member runtime' }) })
  const o = t.open(Object.assign({}, MEET))
  const mid = o.meeting
  t.attend({ meeting: mid, member: 'r-1' })
  t.attend({ meeting: mid, member: 'r-2' })
  t.wait({ meeting: mid, member: 'r-2', until: 'speak' })
  const sp = t.speak({ meeting: mid, member: 'r-1', text: 'x' })
  ok(sp.ok === true && sp.receipt.speeches >= 1, '★★★ the academic act survived a failed wake (refusing to wake never undoes a speech)', { ok: sp.ok, s: sp.receipt.speeches })
  const wake = sp.receipt.firedWaiters[0].wake
  ok(wake.delivered === false && wake.via === 'seam' && wake.woken === false, '★★★ the delivery failure is recorded on the waiter', wake)
  has(wake.why, 'skip', '★ ...and names the policy that swallowed it')
  ok(t.summary({ meeting: mid }).waiters[0].state === 'fired', '★ the row is still fired: the EVENT happened even though the wake did not land')

  const t2 = mkWith({})
  const o2 = t2.open(Object.assign({}, MEET))
  const m2 = o2.meeting
  t2.attend({ meeting: m2, member: 'r-1' })
  t2.attend({ meeting: m2, member: 'r-2' })
  t2.wait({ meeting: m2, member: 'r-2', until: 'speak' })
  const sp2 = t2.speak({ meeting: m2, member: 'r-1', text: 'y' })
  const w2 = sp2.receipt.firedWaiters[0].wake
  ok(w2.delivered === false && w2.via === 'none', '★★ no seam and no mailbox => via:"none" (the absence is recorded, not faked)', w2)
  has(w2.why, 'no wake seam was injected', '★ ...with the sentence that says what is missing and how to supply it')
}

console.log('\n=== 14. durability: a wait survives snapshot/restore, and ids do not restart ===')
{
  const t = mk({})
  const o = t.open(Object.assign({}, MEET))
  const mid = o.meeting
  t.wait({ meeting: mid, member: 'r-1', until: 'hand', timeoutMs: 3000 })
  const f = mk({})
  const r = f.restore(JSON.parse(JSON.stringify(t.snapshot())))
  ok(r.ok === true, 'premise: the snapshot hydrates into a fresh instance', r && r.restored)
  const s = f.summary({ meeting: mid })
  ok(s.waiters.length === 1 && s.waiters[0].member === 'r-1' && s.waiters[0].until === 'hand' && s.waiters[0].state === 'armed',
    '★★★ the armed wait is DURABLE: it is on the meeting row, not in a closure that a restart erases', s.waiters)
  ok(s.waiters[0].deadlineAt === 4000 && s.waiters[0].deadlineMs === 3000,
    '★★ ...including its deadline (a persisted wait keeps the clock it was given)', { at: s.waiters[0].deadlineAt, ms: s.waiters[0].deadlineMs })
  const w2 = f.wait({ meeting: mid, member: 'r-2', until: 'speak' })
  ok(w2.waiter.id === 'w-2', '★★ ids continue after a restore instead of colliding at w-1', w2.waiter.id)
  const late = f.sweepDue({ at: 5000 })
  ok(late.expiredWaitersCount === 1 && late.expiredWaiters[0].member === 'r-1',
    '★★ the restored deadline is still OBSERVED by the sweep (the wait did not survive as decoration)', late.expiredWaitersCount)
}

console.log('\n──────────────────────────────────────────────────────────────')
console.log('RUN 239 meetings: ' + passed + ' passed, ' + failed + ' failed')
if (failed > 0) {
  console.log('FAILURES:')
  for (const f of failures) console.log('  - ' + f)
  process.exitCode = 1
} else {
  console.log('RESULT: PASS')
}
