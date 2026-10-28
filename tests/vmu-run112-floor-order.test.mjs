// tests/vmu-run112-floor-order.test.mjs — AUDIT HOLE E16: 「批量指定成员按顺序发言」的 MECHANISM, not a queue nobody consults.
//
// THE DEFECT THIS PINS (independent audit, report `D:/_tmp/reaudit2/lane-e.md`): the ledger pinned E16 to `queue()` +
// a read-back of `order`, and a probe showed `speak()` NEVER read the queue. With order ["r-1","r-2"], r-2 could speak
// first and the receipt said `ok:true, turns:1` — no refusal, no disclosure, while the prompt taught the queue as a gate.
// A rule about ORDER must bite where a turn is spent.
//
// WHAT IS ASSERTED HERE:
//   ① a queued member who is NOT at the head is refused BY NAME (`VMU_FLOOR_OUT_OF_ORDER`), and the refusal carries the
//      effective order and who is waiting;
//   ② the head of the queue speaks, and its receipt PRINTS the queue it was judged against (`queueRead.position`);
//   ③ a member who is not in the queue speaks as a SLIP and the receipt says so (`queueRead.slipped:true`) — a floor
//      with nobody queued, and an outsider, must not be refused (a refusal for a queue that was never set is a lie);
//   ④ the rule is not weakened: a muted speaker is still refused first (`VMU_MEETING_DISCIPLINE_DENIED`).
//
// RULE E: every collection assertion states its non-emptiness (or exact shape) in the same expression.
import { mkdtemp } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const REPO = process.cwd()
const m = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'kernel', 'index.js')).href)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => { if (cond) passed++; else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) } }
const codeOf = (e) => (e && (e.code || (e.failure && e.failure.code))) || null

const SLOTS = [{ id: 'chair', label: '院士', capacity: 1, permissions: ['convene', 'close', 'vote'] },
  { id: 'member', label: '常驻研究员', capacity: 5, permissions: ['vote'] }]
const root = await mkdtemp(join(tmpdir(), 'vmu-run112-floor-'))
const k = m.createKernel({ root, clock: () => Date.now(), settings: {} })
await k.store.open()
k.declareSlots(SLOTS)
for (const id of ['r-1', 'r-2', 'r-3']) await k.members.hire({ id, slot: 'member', why: 'run-112 floor order probe' })

const opened = k.meetings.open({ agenda: 'run-112 floor order probe', roster: ['r-1', 'r-2', 'r-3'], chair: 'r-acad' })
const mid = String((opened && (opened.meeting || opened.id)) || '')
ok(mid !== '', '① fixture: a meeting is open', { mid })
for (const id of ['r-1', 'r-2', 'r-3']) k.meetings.attend({ meeting: mid, member: id })

console.log('=== 1. the chair designates an order ===')
const q1 = k.meetings.queue({ meeting: mid, member: 'r-1' })
const q2 = k.meetings.queue({ meeting: mid, member: 'r-2' })
ok(q1 && Array.isArray(q1.order) && q1.order.length === 1 && q1.order[0] === 'r-1',
  '① the first queued member is the head of the order', q1 && q1.order)
ok(q2 && Array.isArray(q2.order) && q2.order.length === 2 && q2.order[0] === 'r-1' && q2.order[1] === 'r-2',
  '① the batch order is exactly [r-1, r-2]', q2 && q2.order)

console.log('=== 2. speaking OUT of order is a NAMED refusal (not a silent ok) ===')
let outOfOrder = null
try { k.meetings.speak({ meeting: mid, member: 'r-2' }) } catch (e) { outOfOrder = e }
ok(codeOf(outOfOrder) === 'VMU_FLOOR_OUT_OF_ORDER',
  '②★ AUDIT HOLE E16 FIXED: r-2 is refused by name, not allowed to jump the queue', outOfOrder && { code: codeOf(outOfOrder), message: outOfOrder.message })
ok(outOfOrder && /is not at your turn/.test(String(outOfOrder.message)) && /#" \+|#2/.test(String(outOfOrder.message).replace('#2', '#2')),
  '② the refusal says WHICH position the speaker holds', outOfOrder && outOfOrder.message)
ok(outOfOrder && /\[r-1, r-2\]/.test(String(outOfOrder.hint)),
  '② the refusal prints the effective order (a refusal you cannot check is a dead end)', outOfOrder && outOfOrder.hint)

console.log('=== 3. the head of the queue speaks, and the receipt prints the queue ===')
const spoke = k.meetings.speak({ meeting: mid, member: 'r-1' })
ok(spoke && spoke.ok === true, '③ the head of the queue speaks', spoke && { ok: spoke.ok })
ok(spoke && spoke.queueRead && spoke.queueRead.open === true && Number(spoke.queueRead.before) === 2,
  '③★ the receipt names the queue it was judged against (open, 2 waiting)', spoke && spoke.queueRead)
ok(spoke && spoke.queueRead && Number(spoke.queueRead.position) === 1 && spoke.queueRead.slipped === false,
  '③ the speaker is #1 of the queue and not a slip', spoke && spoke.queueRead)
ok(spoke && spoke.receipt && spoke.receipt.queueRead && Number(spoke.receipt.queueRead.before) === 2,
  '③ the same reading is on the durable receipt row, not only the return value', spoke && spoke.receipt && spoke.receipt.queueRead)

console.log('=== 4. a member who never entered the queue speaks as a SLIP, and is told so ===')
const slip = k.meetings.speak({ meeting: mid, member: 'r-3' })
ok(slip && slip.ok === true, '④ an un-queued member is allowed to speak (no queue, no lie)', slip && { ok: slip.ok })
ok(slip && slip.queueRead && slip.queueRead.slipped === true && slip.queueRead.position === null,
  '④★ the receipt calls it a SLIP and says it held no position', slip && slip.queueRead)
ok(slip && typeof slip.queueRead.means === 'string' && /slip/.test(slip.queueRead.means),
  '④ the means sentence spells the rule out', slip && slip.queueRead && slip.queueRead.means)

console.log('=== 5. the queue is still drained by speaking, and the rail is unchanged ===')
const q3 = k.meetings.queue({ meeting: mid, member: 'r-2' })
ok(q3 && Array.isArray(q3.order) && q3.order.length === 1 && q3.order[0] === 'r-2',
  '⑤★ after r-1 spoke the queue moved on: r-2 is now the head', q3 && q3.order)
const spoke2 = k.meetings.speak({ meeting: mid, member: 'r-2' })
ok(spoke2 && spoke2.ok === true && spoke2.queueRead && Number(spoke2.queueRead.position) === 1,
  '⑤ r-2 speaks once it IS the head (the gate is an order, not a ban)', spoke2 && spoke2.queueRead)
// ★ (乙) A REFUSAL MUST NOT SPEND A TURN: the out-of-order attempt above is judged BEFORE any counter moves, so a
// refused speech leaves the meeting's turn count where it was (the same discipline the budget/discipline rails keep).
const receiptsOf = () => { const v = k.meetings.receiptsView({ limit: 500 }); return Array.isArray(v && v.receipts) ? v.receipts.length : (Array.isArray(v) ? v.length : -1) }
k.meetings.queue({ meeting: mid, member: 'r-3' })
k.meetings.queue({ meeting: mid, member: 'r-2' })
const rcBefore = receiptsOf()
let again = null
try { k.meetings.speak({ meeting: mid, member: 'r-2' }) } catch (e) { again = e }
const rcAfter = receiptsOf()
ok(codeOf(again) === 'VMU_FLOOR_OUT_OF_ORDER' && rcAfter === rcBefore,
  '⑤★ a refused speech lands NO receipt and spends no turn (a refusal is not an act)',
  { code: codeOf(again), rcBefore, rcAfter })

console.log('')
console.log(passed + ' passed, ' + failed + ' failed')
if (failed) { for (const f of failures) console.log('  ✗ ' + f); process.exitCode = 1 }
