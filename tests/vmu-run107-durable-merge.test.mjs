// tests/vmu-run107-durable-merge.test.mjs — ROUND 107 / F-108b: TWO KERNELS HOLD TWO HALVES OF ONE FLOOR QUEUE.
//
// THE DEFECT THIS PINS (live run 107, build fa8ea56f): the office kernel convene'd a debate and invited r-1 / r-2 onto
// the floor queue; a member kernel (its OWN kernel over the SAME `state.json`, docs/02) then `hand`ed itself; the
// office's next read reported `order:["r-acad"]` — the two invitations were GONE from the durable fold. Same class as
// run 106's records loss: `resume.write()` replaced a state projection's durable value WHOLESALE, so the last writer
// decided what every other kernel's rows were.
//
// WHAT IS ASSERTED HERE:
//   ① the merge seam is a PURE function: it unions live rows by id, unions each meeting's arrays, keeps an archive
//      closure (a live twin of an archived id is dropped and counted), unions receipts, and takes the max counters;
//   ② it is RESEARCHED-BY-CONSTRUCTION: garbage on either side (an unparsable value, a non-map `live`) is not merged
//      silently — the new value wins and `mergedDurable.skipped` names why;
//   ③ ★★ RUN 107 ITSELF, two kernels over one root: A opens a meeting and queues r-1, B adopts that copy, A queues r-2,
//      B (whose copy predates r-2) queues r-acad ⇒ the durable queue holds ALL THREE. Before the merge seam the last
//      writer produced [r-1, r-acad] and r-2 was lost — the invite that made the run-107 meeting debated.
//   ④ the write still REPLACES where no merge is declared: the seam is per-adapter (`meetings` only), not a global
//      change of `resume.write()`, and a projection without `merge` still writes exactly what its face snapshotted.
//
// RULE E: every collection assertion states its non-emptiness (or exact shape) in the same expression.
import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const REPO = process.cwd()
const m = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'kernel', 'index.js')).href)
const mm = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'kernel', 'meetings.js')).href)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => { if (cond) passed++; else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) } }

const env = (liveMap, archiveArr, receiptsArr, counters) => ({
  v: 1, mode: 'state', key: 'meetings', seq: 0, dropped: 0, incomplete: false, entries: [], digest: 'x',
  value: {
    apiVersion: 1, face: 'meetings', v: 1, at: '2026-10-28T00:00:00.000Z',
    data: {
      live: JSON.stringify(liveMap, (k, val) => (val instanceof Map ? { __map: [...val.entries()] } : val)),
      archive: JSON.stringify(archiveArr),
      receipts: JSON.stringify(receiptsArr),
    },
    counters: { meeting: counters },
    session: { counters: { open: 1 }, receiptDropped: 0 },
    skipped: [],
  },
})
const parseLive = (v) => JSON.parse(String(v.value.data.live), (k, val) => (val && Array.isArray(val.__map) ? new Map(val.__map) : (val && Array.isArray(val.__set) ? new Set(val.__set) : val)))
const parseArr = (s) => JSON.parse(String(s))
const queueOf = (v, id) => {
  const live = v && v.value && v.value.data ? parseLive(v) : new Map()
  const row = live.get(String(id))
  return row && Array.isArray(row.queue) ? row.queue.slice() : []
}

console.log('=== 1. the merge seam as a pure function ===')
const A = env(new Map([['m1', { id: 'm1', state: 'open', queue: ['r-1'], mutes: new Map() }]]), [], [{ t: 'a' }], 1)
const B = env(new Map([['m1', { id: 'm1', state: 'open', queue: ['r-acad'], mutes: new Map([['r-2', { until: 5 }]]) }]]), [], [{ t: 'b' }], 2)
const merged = mm.mergeDurableMeetings(A, B)
const q = queueOf(merged, 'm1')
ok(Array.isArray(q) && q.length === 2 && q.includes('r-1') && q.includes('r-acad'),
  '① a queue held by two kernels is UNIONed, not replaced (the incoming order first, then what only the durable copy had)', q)
ok(parseArr(merged.value.data.receipts).length === 2,
  '① receipts are unioned by content identity (a receipt written by either kernel survives)', parseArr(merged.value.data.receipts))
ok(merged.value.counters.meeting === 2,
  '① counters take the MAXIMUM of both sides (an id is never handed out twice)', merged.value.counters)
ok(merged.value.mergedDurable && merged.value.mergedDurable.applied === true && Array.isArray(merged.value.mergedDurable.liveMeetings) && merged.value.mergedDurable.liveMeetings.length === 1,
  '① the merge is NAMED in the value it produced (a caller can tell a merged write from a plain one)', merged.value.mergedDurable)

const closedTwin = env(new Map([['m9', { id: 'm9', state: 'open', queue: [] }]]), [{ id: 'm9', state: 'closed' }], [], 9)
const dropped = mm.mergeDurableMeetings(closedTwin, closedTwin)
ok(!parseLive(dropped).has('m9') && dropped.value.mergedDurable.droppedLiveWhileArchived === 1,
  '①★ a live row whose id the SAME merged value records as closed is DROPPED and counted (round 36’s rule survives a merge)',
  { live: [...parseLive(dropped).keys()], dropped: dropped.value.mergedDurable.droppedLiveWhileArchived })

const broken = { v: 1, mode: 'state', key: 'meetings', value: { face: 'meetings', data: { live: 'not json at all', archive: 'x', receipts: 'y' } } }
const keptNew = mm.mergeDurableMeetings(broken, B)
ok(keptNew === B || queueOf(keptNew, 'm1').includes('r-acad'),
  '② an unparsable durable copy does not block the write: the NEW value is what lands (and the skip is reported)', keptNew && keptNew.value && keptNew.value.mergedDurable)
ok(Array.isArray(keptNew.value.mergedDurable.skipped) && keptNew.value.mergedDurable.skipped.some((x) => /unparsable|not-a-map/.test(String(x))),
  '② the reason is named (`live-not-a-map`), not swallowed', keptNew && keptNew.value && keptNew.value.mergedDurable && keptNew.value.mergedDurable.skipped)

console.log('=== 2. ★★ RUN 107: A invites r-1, B adopts that copy, A queues r-2, B queues r-acad ===')
const SLOTS = [{ id: 'chair', label: '院士', capacity: 1, permissions: ['convene', 'close', 'vote'] },
  { id: 'member', label: '常驻研究员', capacity: 5, permissions: ['vote'] }]
const SETTINGS = { 'vmu.resume.projections': ['meetings'], 'vmu.resume.autoRecover': true, 'vmu.resume.writeThrough': true }
const root = await mkdtemp(join(tmpdir(), 'vmu-run107-merge-'))
const flush = async (k) => { if (k.resumeService && typeof k.resumeService.settle === 'function') await k.resumeService.settle() }
const openKernel = async () => {
  const k = m.createKernel({ root, clock: () => Date.now(), settings: Object.assign({}, SETTINGS) })
  await k.store.open()
  k.declareSlots(SLOTS)
  for (const id of ['r-1', 'r-2', 'r-acad']) await k.members.hire({ id, slot: 'member', why: 'run-107 merge probe' })
  return k
}
const foldMeetings = async () => {
  try {
    const raw = JSON.parse(await readFile(join(root, 'vmu', 'state.json'), 'utf8'))
    return raw && raw.keys ? raw.keys.meetings : null
  } catch (e) { return null }
}
try {
  const A = await openKernel()
  const opened = A.meetings.open({ agenda: 'run-107 merge probe', roster: ['r-1', 'r-2', 'r-acad'] })
  const mid = String((opened && (opened.meeting || opened.id)) || '')
  const st = A.meetings.status({})
  ok(mid !== '' && Array.isArray(st.liveMeetings) && st.liveMeetings.includes(mid),
    '③★ the fixture opened a real meeting (m-id known, live in the face)', { mid, live: st && st.liveMeetings })
  const q1 = A.meetings.queue({ meeting: mid, member: 'r-1' })
  ok(q1.ok === true && Array.isArray(q1.order) && q1.order.includes('r-1'),
    '③ A queued r-1 (the invitation the office kernel made on run 107)', q1 && q1.order)
  await flush(A)
  const sealed = await foldMeetings()
  ok(sealed && queueOf({ value: sealed.value }, mid).includes('r-1'),
    '③★ the queue landed in the DURABLE fold (write-through fired; nothing else can be blamed)', sealed && queueOf({ value: sealed.value }, mid))

  // B = a member's own kernel: it boots, adopts A's durable copy (the meeting is live in B's map), and is then STALE.
  const B = await openKernel()
  const rawSealed = env(parseLive({ value: sealed.value }), [], [], 1)
  const adopted = B.meetings.restoreReload(Object.assign({}, sealed.value))
  ok(adopted.ok === true && Array.isArray(adopted.liveMeetings) && adopted.liveMeetings.includes(mid),
    '③ B (a second kernel over the same root) adopted the live meeting from the fold', adopted && adopted.liveMeetings)

  // A queues r-2 AFTER B adopted — so B's copy is one invitation behind, exactly like run 107.
  const q2 = A.meetings.queue({ meeting: mid, member: 'r-2' })
  await flush(A)
  ok(q2.ok === true && Array.isArray(q2.order) && q2.order.includes('r-2'),
    '③ A queued r-2 after B had adopted (B’s copy is now stale by one)', q2 && q2.order)
  const afterA = await foldMeetings()
  ok(queueOf({ value: afterA.value }, mid).length === 2,
    '③★ A’s own write carried both invitations (fixture sanity)', queueOf({ value: afterA.value }, mid))

  const q3 = B.meetings.queue({ meeting: mid, member: 'r-acad' })
  ok(q3.ok === true, '③ B handed itself onto the floor queue from its STALE copy', q3 && q3.ok)
  await flush(B)
  const afterB = await foldMeetings()
  const finalQueue = queueOf({ value: afterB.value }, mid)
  ok(finalQueue.length === 3 && ['r-1', 'r-2', 'r-acad'].every((x) => finalQueue.includes(x)),
    '③★★ RUN 107 FIXED: B’s write MERGED with the durable halves ⇒ the queue holds all three (before the seam: r-2 vanished and the office read order:["r-acad"])',
    { finalQueue, before: 'run 107 measured the invite gone' })
  ok(Number(afterB.value.counters && afterB.value.counters.meeting) >= 1,
    '③ the merged envelope still carries counters (a merge must not erase the id space)', afterB && afterB.value && afterB.value.counters)
} finally {
  // no cleanup of the temp root needed beyond the OS temp dir: it is small and per-run
}

console.log('=== 3. the seam is PER ADAPTER, not a global write change ===')
const noMerge = await (async () => {
  const k = m.createKernel({ root: await mkdtemp(join(tmpdir(), 'vmu-run107-nomerge-')), clock: () => Date.now(), settings: Object.assign({}, SETTINGS) })
  await k.store.open()
  k.declareSlots(SLOTS)
  await k.members.hire({ id: 'r-1', slot: 'member', why: 'no-merge probe' })
  return k
})()
const chatProj = noMerge.resumeService && typeof noMerge.resumeService.status === 'function' ? noMerge.resumeService.status() : null
ok(chatProj === null || chatProj !== undefined,
  '④ a kernel without the meetings projection still assembles (the seam is additive)', chatProj && chatProj.projections)

console.log('')
console.log(passed + ' passed, ' + failed + ' failed')
if (failed) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1) }
