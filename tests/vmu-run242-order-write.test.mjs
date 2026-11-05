// tests/vmu-run242-order-write.test.mjs — RUN 242 / E16 (the last mechanically-closable PARTIAL row in the 93-rule ledger).
//
// THE ROW (docs/acceptance/rules-ledger.json, E16 ← 规则 L50「主席可以批量指定成员按一定顺序发言」):
//   `order({members})` 的写路径已实现（回执带 before/after 或 moved），但还没有一条端到端测试钉住它 ⇒ 补本套件后转 DONE.
// The kernel write path landed in RUN 229 and the host face routes `members` to it, but nothing proved the WHOLE road:
// face → registry → service → stored queue → the next speech really takes position 1. A write path that is only
// "implemented" is a claim; this suite is the receipt.
//
// WHAT THIS PROVES, each claim SEPARATE from `ok:true` (and each at the layer where it can be observed):
//   §1 the READ form (no `members`) is the old view: it reports the stored queue + the effective mode and says which key
//      was enforced, and it echoes no `members` (the write-only field does not leak into the old shape);
//   §2 the WRITE form really REPLACES the stored queue (what `after` promises is what the next read returns), and it
//      names `moved` (1-based) / `dropped` instead of leaving the caller to diff two arrays;
//   §3 THE ORDER BINDS THE FLOOR (measured at the kernel, where `queueRead.position` lives): after the reorder the member
//      named FIRST takes the floor with position 1 — 规则 L50's 「按一定顺序发言」 is not a receipt field;
//   §4 the rails: chair-only (`VMU_NOT_PERMITTED`, naming the chair), `by` required, empty / duplicate / non-member lists
//      refused by name, a seat that has not sat down refused WITH the way to seat them, no declared chair ⇒
//      `VMU_ENGINE_UNAVAILABLE`, and a RE-COMPUTING order rule refused (`VMU_STATE`) rather than stored and then
//      contradicted by the next read;
//   §5 the record is written: a minutes row of kind `floor-order` carries the order in force, and the receipt object the
//      face returns carries the same before/after (a row nobody can read back is not a record).
//
// RULE E: every collection assertion states NON-EMPTINESS in the SAME expression and prints the count.
//
// Run: node tests/vmu-run242-order-write.test.mjs   (last line: === VMU RUN 242 ORDER WRITE: N passed, M failed ===)

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const HARNESS = join(REPO, 'scripts', 'sim', 'harness.mjs')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; failures.push(label); console.log('  FAIL ' + label + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 300) + ']')) }
}
const has = (hay, needle, label) => ok(String(hay === undefined || hay === null ? '' : hay).includes(needle), label, hay)
const codeOf = (r) => (r && r.code) || null
const NL = String.fromCharCode(10)

// ── a kernel-level seam, for the claims a face cannot show (floor position, and the rails no face reaches) ────────────
let NOW = 1000
const svc = (vals = {}, seams = {}) => createMeetings(Object.assign({ clock: () => NOW, settings: { get: (k) => (vals || {})[k] } }, seams))
const ROSTER = ['acad', 'r-1', 'r-2', 'r-3']
const DECLARED = { 'vmu.meetings.quorumCap': 0, 'vmu.meetings.orderMode': 'fifo' }
const openedSvc = (vals = DECLARED, seams = {}, seats = ['r-1', 'r-2', 'r-3']) => {
  const t = svc(vals, seams)
  const r = t.open({ type: 'ordinary', chair: 'acad', roster: ROSTER })
  for (const m of seats) t.attend({ meeting: r.meeting, member: m })
  return { t, id: r.meeting }
}

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r242-ord-')); roots.push(d); return d }

try {
  const { boot } = await import(pathToFileURL(HARNESS).href)
  const root = await mkRoot()
  const h = await boot({ root, clock: () => 1000, withPrompt: false, settings: { 'vmu.tools.faces': ['human', 'meeting', 'turn'], 'vmu.meetings.orderMode': 'fifo', 'vmu.meetings.quorumCap': 0 } })
  const call = (name, args = {}, as = 'r-acad') => h.call(name, args, { as: as === null ? null : { agent: { id: as } } })

  const started = await call('vibe_v5_start', { problem: 'run242 order-write probe', researcherCount: 3 })
  ok(started && started.ok === true, '§0 a staffed institute exists (fixture precondition)', started && codeOf(started))

  // `vibe_v5_meeting` only CONVENES; every act below is the host meeting face (`vibe_vmu_meeting`), which is where the
  // service registry and the `order` write path actually live. (A brief that sends acts to the convene face is the
  // P-class defect this suite incidentally pins: the convene face refuses with "only CONVENES".)
  const convened = await call('vibe_v5_meeting', { member: 'r-acad', agenda: ['定发言顺序'], title: 'E16 顺序复验', type: 'ordinary' })
  const mid = convened && (convened.meeting || convened.id)
  ok(typeof mid === 'string' && mid.length > 0, '§0b the institute holds a meeting (fixture precondition)', convened && codeOf(convened))
  for (const seat of ['r-1', 'r-2']) {
    const sat = await call('vibe_vmu_meeting', { action: 'attend', id: mid, member: seat }, seat)
    ok(sat && sat.ok === true, '§0c premise: ' + seat + ' is present', sat && codeOf(sat))
  }
  for (const seat of ['r-1', 'r-2']) {
    const q = await call('vibe_vmu_meeting', { action: 'hand', id: mid, member: seat }, seat)
    ok(q && q.ok === true, '§0d premise: ' + seat + ' raised a hand, so a queue exists in arrival order', q && codeOf(q))
  }

  // ── §1 THE READ FORM IS UNCHANGED ─────────────────────────────────────────────────────────────────────────────
  {
    console.log(NL + '§1 the READ form (no members) reports the stored queue and the mode in force')
    const read = await call('vibe_vmu_meeting', { action: 'order', id: mid })
    ok(read && read.ok === true && read.registry === 'service', '§1a action order with no members succeeds on the service registry', read && codeOf(read))
    ok(Array.isArray(read.order) && read.order.length === 2 && read.order.join(',') === 'r-1,r-2',
      '§1b the read form reports the queue as stored (arrival order)', read && read.order)
    ok(typeof read.mode === 'string' && read.mode === 'fifo' && read.source === 'setting',
      '§1c and the effective mode with its SOURCE (a setting, not an override)', read && { mode: read.mode, source: read.source })
    ok(Array.isArray(read.enforced) && read.enforced.length > 0 && read.enforced.includes('vmu.meetings.orderMode'),
      '§1d and names the key that was enforced (non-vacuous, count printed)', read && read.enforced)
    ok(read.members === undefined && read.before === undefined,
      '§1e a READ echoes no write-only field (`members`/`before`): the old shape is not widened',
      read && { members: read.members, before: read.before })
  }

  // ── §2 THE WRITE REPLACES THE STORED QUEUE AND NAMES THE MOVES ────────────────────────────────────────────────
  {
    console.log(NL + '§2 the WRITE form replaces the stored queue (not append) and names moved/dropped')
    const wrote = await call('vibe_vmu_meeting', { action: 'order', id: mid, by: 'r-acad', members: ['r-2', 'r-1'], reason: 'E16: 主席指定 r-2 先讲' })
    ok(wrote && wrote.ok === true, '§2a the chair may reorder a live queue', wrote && codeOf(wrote))
    ok(Array.isArray(wrote.members) && wrote.members.join(',') === 'r-2,r-1', '§2b the receipt echoes the requested list', wrote && wrote.members)
    ok(Array.isArray(wrote.before) && wrote.before.join(',') === 'r-1,r-2', '§2c before = the order in force before the write', wrote && wrote.before)
    ok(Array.isArray(wrote.after) && wrote.after.join(',') === 'r-2,r-1', '§2d after = the order in force after the write', wrote && wrote.after)
    ok(Array.isArray(wrote.moved) && wrote.moved.length === 2
      && wrote.moved.some((mv) => mv.member === 'r-2' && mv.from === 2 && mv.to === 1)
      && wrote.moved.some((mv) => mv.member === 'r-1' && mv.from === 1 && mv.to === 2),
      '§2e moved names who went where (1-based), so the caller need not diff two arrays', wrote && wrote.moved)
    ok(Array.isArray(wrote.dropped) && wrote.dropped.length === 0, '§2f nobody was dropped (the queue held exactly these two)', wrote && wrote.dropped)
    const readBack = await call('vibe_vmu_meeting', { action: 'order', id: mid })
    ok(readBack && Array.isArray(readBack.order) && readBack.order.join(',') === 'r-2,r-1',
      '★ §2g THE STORE AGREES WITH THE RECEIPT: the next read returns what after promised', readBack && readBack.order)

    // a third seat must be PRESENT before it can be ordered into the floor (the rail §4h is the same one)
    const sat3 = await call('vibe_vmu_meeting', { action: 'attend', id: mid, member: 'r-3' }, 'r-3')
    ok(sat3 && sat3.ok === true, '§2h0 premise: r-3 sat down, so it may be ordered into the floor', sat3 && codeOf(sat3))
    // replacing a queue with a SHORTER one must NAME the seats it pushed out (an APPEND would have kept them)
    const three = await call('vibe_vmu_meeting', { action: 'order', id: mid, by: 'r-acad', members: ['r-2', 'r-1', 'r-3'], reason: 'E16: 加第三席' })
    ok(three && three.ok === true && Array.isArray(three.after) && three.after.length === 3,
      '§2h the chair may extend the designated order (three seats named)', three && three.after)
    const shrunk = await call('vibe_vmu_meeting', { action: 'order', id: mid, by: 'r-acad', members: ['r-3'], reason: 'E16: 只留一席' })
    ok(shrunk && shrunk.ok === true && Array.isArray(shrunk.dropped) && shrunk.dropped.length === 2
      && shrunk.dropped.includes('r-2') && shrunk.dropped.includes('r-1'),
      '★ §2i dropping seats is REPORTED by name (a replaced queue is not an appended one)', shrunk && shrunk.dropped)
    const narrowed = await call('vibe_vmu_meeting', { action: 'order', id: mid })
    ok(narrowed && Array.isArray(narrowed.order) && narrowed.order.join(',') === 'r-3',
      '§2j and the store really holds only the named seat', narrowed && narrowed.order)
  }

  // ── §3 THE ORDER BINDS THE FLOOR (規則 L50 measured where the floor is judged) ───────────────────────────────
  {
    console.log(NL + '§3 after the reorder the member named FIRST takes the floor (kernel: queueRead.position)')
    const k = openedSvc()
    for (const seat of ['r-1', 'r-2']) k.t.queue({ meeting: k.id, member: seat })
    const before = k.t.orderView({ meeting: k.id })
    ok(Array.isArray(before.order) && before.order.join(',') === 'r-1,r-2', '§3a premise: the queue is the arrival order r-1, r-2', before && before.order)
    const w = k.t.order({ meeting: k.id, members: ['r-2', 'r-1'], by: 'acad', why: 'E16: r-2 先讲' })
    ok(w && w.ok === true && w.after.join(',') === 'r-2,r-1', '§3b premise: the chair reordered the queue', w && w.after)
    const spoke = k.t.speak({ meeting: k.id, member: 'r-2' })
    ok(spoke && spoke.ok === true, '§3c premise: the first-named member speaks', spoke && spoke.ok)
    const qr = spoke && spoke.queueRead
    ok(!!qr && Number(qr.position) === 1,
      '★★ §3d THE ORDER BINDS THE FLOOR: r-2 (named first) holds position 1 — 規則 L50 is measured here, not in a receipt field',
      qr)
    ok(!!qr && Array.isArray(qr.skippedAbsent) && qr.skippedAbsent.length === 0,
      '§3e and nobody was passed over for absence (r-2 is present)', qr && qr.skippedAbsent)
    ok(!!qr && typeof qr.means === 'string' && qr.means.includes('r-2, r-1'),
      '§3f the receipt prints the order that judged the speech (「按顺序发言」 must be verifiable next to the speech)', qr && qr.means)
  }

  // ── §4 THE RAILS ──────────────────────────────────────────────────────────────────────────────────────────────
  {
    console.log(NL + '§4 the rails around the write')
    const notChair = await call('vibe_vmu_meeting', { action: 'order', id: mid, by: 'r-1', members: ['r-1', 'r-2'] }, 'r-1')
    ok(codeOf(notChair) === 'VMU_NOT_PERMITTED', '★ §4a a non-chair is refused BY NAME (VMU_NOT_PERMITTED)', notChair && codeOf(notChair))
    has(notChair && notChair.hint, 'r-acad', '§4b and the refusal names the declared chair, so the caller can route the act')
    const noBy = await call('vibe_vmu_meeting', { action: 'order', id: mid, members: ['r-1', 'r-2'] })
    ok(codeOf(noBy) === 'VMU_INVALID_ARGUMENT', '★ §4c `by` is required on a write (who decided is part of the act)', noBy && codeOf(noBy))
    has(noBy && noBy.hint, 'by', '§4d and the hint names the missing parameter')
    const empty = await call('vibe_vmu_meeting', { action: 'order', id: mid, by: 'r-acad', members: [] })
    ok(codeOf(empty) === 'VMU_INVALID_ARGUMENT', '★ §4e an empty list is refused (omit members to READ)', empty && codeOf(empty))
    const dup = await call('vibe_vmu_meeting', { action: 'order', id: mid, by: 'r-acad', members: ['r-1', 'r-1'] })
    ok(codeOf(dup) === 'VMU_INVALID_ARGUMENT', '★ §4f the same seat twice is refused (a queue is a sequence, not a count)', dup && codeOf(dup))
    const outsider = await call('vibe_vmu_meeting', { action: 'order', id: mid, by: 'r-acad', members: ['r-9'] })
    ok(codeOf(outsider) === 'VMU_NOT_MEMBER', '★ §4g a non-member is refused BY NAME (VMU_NOT_MEMBER)', outsider && codeOf(outsider))

    // a seat that has not sat down cannot be queued into the floor: the refusal must name HOW to seat them
    const k2 = openedSvc(DECLARED, {}, ['r-1'])
    const absentErr = (() => { try { k2.t.order({ meeting: k2.id, members: ['r-1', 'r-3'], by: 'acad' }); return null } catch (e) { return e } })()
    ok(!!absentErr && absentErr.code === 'VMU_NOT_MEMBER', '★ §4h a PRESENT-only rule holds: an absent seat is refused', absentErr && absentErr.code)
    has(absentErr && absentErr.hint, 'attend', '§4i and the hint names the way to seat them (attend / chair admit), never a silent queue write')
    has(absentErr && absentErr.message, 'r-3', '§4j and it names the absent seat itself')
    ok(!!absentErr && Array.isArray(absentErr.enforced) && absentErr.enforced.length > 0
      && absentErr.enforced.every((k) => typeof k === 'string' && k.startsWith('vmu.meetings.')),
      '§4k a refusal carries enforced[] naming the settings that were evaluated (non-vacuous, count printed)',
      absentErr && absentErr.enforced)

    // no chair declared ⇒ nobody may designate an order (the kernel never invents an authority)
    const t3 = svc(DECLARED)
    const r3 = t3.open({ type: 'ordinary', roster: ROSTER })
    t3.attend({ meeting: r3.meeting, member: 'r-1' })
    const noChair = (() => { try { t3.order({ meeting: r3.meeting, members: ['r-1'], by: 'acad' }); return null } catch (e) { return e } })()
    ok(!!noChair && noChair.code === 'VMU_ENGINE_UNAVAILABLE', '★ §4l no declared chair ⇒ VMU_ENGINE_UNAVAILABLE (an authority is declared, never assumed)', noChair && noChair.code)

    // a RE-COMPUTING order rule cannot bind a stored list: refuse by name rather than store and be contradicted
    const k4 = openedSvc()
    k4.t.overrideOrder({ meeting: k4.id, by: 'acad', why: 'E16: 复算序不能存表', mode: 'round-robin' })
    const recompute = (() => { try { k4.t.order({ meeting: k4.id, members: ['r-2', 'r-1'], by: 'acad' }); return null } catch (e) { return e } })()
    ok(!!recompute && recompute.code === 'VMU_STATE', '★★ §4m an order rule that RE-COMPUTES refuses the write (VMU_STATE): the receipt may not promise an order the next read contradicts', recompute && recompute.code)
    has(recompute && recompute.message, 'RE-COMPUTES', '§4n and it says WHY in so many words')
  }

  // ── §5 THE RECORD IS WRITTEN ─────────────────────────────────────────────────────────────────────────────────
  {
    console.log(NL + '§5 the record and the receipt agree: the minutes carry a floor-order row')
    const k5 = openedSvc()
    for (const seat of ['r-1', 'r-2']) k5.t.queue({ meeting: k5.id, member: seat })
    const w = k5.t.order({ meeting: k5.id, members: ['r-2', 'r-1'], by: 'acad', why: 'E16: 记账复验' })
    ok(w && w.ok === true, '§5a premise: the write succeeds', w && w.ok)
    const rows = k5.t.minutes({ meeting: k5.id }).entries.filter((e) => e.kind === 'floor-order')
    ok(rows.length === 1, '★ §5b exactly one minutes row of kind "floor-order" was written (non-vacuous)', rows.length)
    const row = rows.length === 1 ? rows[0] : {}
    ok(Array.isArray(row.order) && row.order.join(',') === 'r-2,r-1', '§5c the row records the order in force after the write', row && row.order)
    ok(Array.isArray(row.before) && row.before.length > 0 && String(row.by) === 'acad',
      '§5d and the order it replaced, plus who decided it (non-vacuous, count printed)', { by: row.by, before: row.before })
    ok(!!w && !!w.receipt && w.receipt.action === 'order'
      && Array.isArray(w.receipt.before) && w.receipt.before.join(',') === 'r-1,r-2'
      && Array.isArray(w.receipt.after) && w.receipt.after.join(',') === 'r-2,r-1',
      '★ §5e the receipt OBJECT the face returns carries the same before/after (not just ok:true)', w && w.receipt)
    ok(!!w && Array.isArray(w.receipt.dropped) && w.receipt.dropped.length === 0,
      '§5f and names the dropped list (empty here, and stated as empty rather than omitted)', w && w.receipt.dropped)
  }
} finally {
  for (const d of roots) { try { await rm(d, { recursive: true, force: true }) } catch { /* best effort */ } }
}

console.log(NL + '=== VMU RUN 242 ORDER WRITE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f) }
process.exit(failed === 0 ? 0 : 1)
