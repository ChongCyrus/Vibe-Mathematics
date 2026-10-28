// tests/vmu-run109-live-meeting-merge.test.mjs — ROUND 109 / F-109a: TWO KERNELS, ONE MEETING, TWO SCOREBOARDS.
//
// THE DEFECT THIS PINS (live run 109, build 425c4463): a member's own kernel attended m2 and spoke in it, and ITS copy
// reported `present 1→2, turns:1`. The office's kernel — the one that convened m2 and held it in its own `live` map —
// kept reading `present:1, turns:0, spokeBy:[]` BEFORE and AFTER that report. `restoreReload` skipped every stored live
// row whose id it already held (`if (live.has(id)) continue`), so "I already have this meeting" silently meant "nothing
// about it was ever written by another instance". A meeting is a SCOREBOARD, not a document: two instances each know
// part of the floor, and the durable fold holds the union.
//
// WHAT IS ASSERTED HERE:
//   ① the reload path MERGES a same-id live row additively: present/queue union, counters max, and it NAMES what it
//      merged (`mergedLive` / `mergedFields`) so a reader can tell a merged reload from a plain one;
//   ② ★★ RUN 109 ITSELF, two kernels over one root: the member kernel is booted FIRST (the live run's shape), the
//      office convenes, the member kernel attends on the same id, and the OFFICE's next status read shows the
//      attendance (before the fix it stayed at the chair alone);
//   ③ the merge never deletes: a member the local copy already saw present survives a reload whose stored row is older;
//   ④ closures still win: a stored live twin of an archived id is DROPPED, not merged (round 36's rule).
//
// RULE E: every collection assertion states its non-emptiness (or exact shape) in the same expression.
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const REPO = process.cwd()
const m = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'kernel', 'index.js')).href)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => { if (cond) passed++; else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) } }

const SLOTS = [{ id: 'chair', label: '院士', capacity: 1, permissions: ['convene', 'close', 'vote'] },
  { id: 'member', label: '常驻研究员', capacity: 5, permissions: ['vote'] }]
const SETTINGS = { 'vmu.resume.projections': ['meetings'], 'vmu.resume.autoRecover': true, 'vmu.resume.writeThrough': true }
const root = await mkdtemp(join(tmpdir(), 'vmu-run109-scoreboard-'))
const flush = async (k) => { if (k.resumeService && typeof k.resumeService.settle === 'function') await k.resumeService.settle() }
const openKernel = async () => {
  const k = m.createKernel({ root, clock: () => Date.now(), settings: Object.assign({}, SETTINGS) })
  await k.store.open()
  k.declareSlots(SLOTS)
  for (const id of ['r-1', 'r-2']) await k.members.hire({ id, slot: 'member', why: 'run-109 scoreboard probe' })
  return k
}

console.log('=== 1. the office convenes, while a member kernel is ALREADY running ===')
const OFFICE = await openKernel()
// ★ the live run's shape: the member's own session was booted before the office convened anything, so it learns the
// meeting only by re-reading the fold afterwards.
const MEMBER = await openKernel()
const opened = OFFICE.meetings.open({ agenda: 'run-109 scoreboard probe', roster: ['r-1', 'r-2'], chair: 'r-acad' })
const mid = String((opened && (opened.meeting || opened.id)) || '')
const before = OFFICE.meetings.quorum({ meeting: mid })
ok(mid !== '' && before && Number(before && before.present) === 1,
  '①★ fixture: the meeting is open with ONLY the chair seated (present 1)',
  { mid, present: before && before.present })
await flush(OFFICE)

MEMBER.store.read('meetings')
const memberCopy = MEMBER.meetings.status({})
ok(Array.isArray(memberCopy && memberCopy.liveMeetings) && memberCopy.liveMeetings.includes(mid),
  '① the second kernel (booted before the meeting existed) adopted it from the fold',
  memberCopy && memberCopy.liveMeetings)

console.log('=== 2. ★★ RUN 109: the member\'s kernel attends, the OFFICE must read it ===')
const attend = MEMBER.meetings.attend({ meeting: mid, member: 'r-1' })
ok(attend && attend.ok === true, '② the member kernel seats r-1 on ITS copy', attend && { ok: attend.ok, present: attend.quorum && attend.quorum.present })
await flush(MEMBER)

const officeAfter = OFFICE.meetings.quorum({ meeting: mid })
ok(Number(officeAfter && officeAfter.present) === 2,
  '②★★ RUN 109 FIXED: the office reads present 2 after ANOTHER kernel seated r-1 (before the fix: 1, and the run\'s own report said "two books")',
  { present: officeAfter && officeAfter.present })
const officeHand = OFFICE.meetings.queue({ meeting: mid, member: 'r-2' })
ok(officeHand && officeHand.ok === true, '② the office still acts on its own copy after the merge', officeHand && officeHand.ok)
await flush(OFFICE)

console.log('=== 3. the merge NAMES itself and never deletes ===')
const memberReload = MEMBER.meetings.restoreReload(OFFICE.meetings.snapshot())
ok(memberReload && memberReload.ok === true && memberReload.mergedLive === 1,
  '③ a reload of a same-id live meeting is MERGED (not skipped, not adopted)', memberReload && { ok: memberReload.ok, mergedLive: memberReload.mergedLive })
ok(memberReload && Array.isArray(memberReload.mergedFields) && memberReload.mergedFields.length >= 1 && memberReload.mergedFields[0].startsWith(mid + ':'),
  '③ the reload NAMES which fields it merged (a merged floor is a fact a reader can check)', memberReload && memberReload.mergedFields)
ok(memberReload && typeof memberReload.mergedLiveMeans === 'string' && /SCOREBOARD/.test(memberReload.mergedLiveMeans),
  '③ the reload SAYS what merging a same-id row means (a floor is a scoreboard, not a duplicate)',
  memberReload && memberReload.mergedLiveMeans)
const afterReload = MEMBER.meetings.quorum({ meeting: mid })
ok(Number(afterReload && afterReload.present) === 2,
  '③★ the merge is additive: r-1 stays present and the office\'s later act is visible in the member kernel',
  { present: afterReload && afterReload.present })
const memberAfterAttend = MEMBER.meetings.snapshot()
const staleBack = MEMBER.meetings.restoreReload(memberAfterAttend)
const staleView = MEMBER.meetings.quorum({ meeting: mid })
ok(staleBack && staleBack.ok === true && Number(staleView && staleView.present) === 2,
  '③ a reload of a copy that predates the office\'s act does not REMOVE a member already seen present (merge is union, never subtraction)',
  { present: staleView && staleView.present })

console.log('=== 4. a closure still wins over a live twin ===')
const closed = OFFICE.meetings.close({ meeting: mid, chair: 'r-acad' })
ok(closed && closed.ok === true, '④ the office closes the meeting (archived in its own copy)', closed && { ok: closed.ok })
await flush(OFFICE)
const memberSees = MEMBER.meetings.restoreReload(OFFICE.meetings.snapshot())
const memberView = MEMBER.meetings.summary({ meeting: mid })
ok(memberSees && memberSees.ok === true && Number(memberSees.evictedLiveWhileArchived) >= 1 && memberView.liveWhileArchived !== true,
  '④★ a live twin whose id the incoming archive records closed is ENDED (and counted), never merged back to life',
  memberSees && { evicted: memberSees.evictedLiveWhileArchived, liveWhileArchived: memberView.liveWhileArchived })

console.log('')
console.log(passed + ' passed, ' + failed + ' failed')
if (failed) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1) }
