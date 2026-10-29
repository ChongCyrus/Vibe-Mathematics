// tests/vmu-wave2-meeting-roster-label-counts.test.mjs — ROUND 120 / ledger E9 + E6 + E36。
//
// THE DEFECTS THIS PINS：
//   · E9「邀请入会的成员」：`open()` 收下 `roster` 但**没有任何读面能说它是不是被收窄过**，而且投票资格
//     (`eligibleVoterIds`) 只读部署花名册 —— 一个没被邀请的人照样出现在票箱 eligible 里，收窄名单没有票权后果。
//   · E6：`kind` 在 convene 时被写进会议对象，却**不出现在** open 回执 / meetingView 上（只有 `title` 能读回），
//     两个"会议叫什么"的字段一个可读、一个只写。
//   · E36：`procedureProgress.skeletonSteps` 对真实 convene 恒为 0 —— `procedureRow()` 把 pack 的骨架对象整个
//     存在 `procedure` 下，而读者只认两种扁平形状，于是"推荐了四步"的会议报出"推荐了零步"。
//
// WHAT THIS SUITE PROVES（每一条都是真会议，不是桩）：
//   ① 显式 `members` 子集 ⇒ roster/present/eligible 三个读面**恰好**是点名的人，`rosterNarrowed:true`，
//      `rosterMeans` 说明这是邀请名单；没被邀请的人不再是 eligible；
//   ② `roster` 别名同样生效；主席不在名单里时仍被开场就座（`presentOutsideRoster` 如实说），attend 加人但名单不变；
//   ③ 不给子集 ⇒ 今天的行为原样（`rosterNarrowed:false`），并且"给的正好是全员"不算收窄；
//   ④ 空名单/非数组/空字符串 ⇒ 具名 `VMU_INVALID_ARGUMENT`，且**没有留下会议**；
//   ⑤ kind/title：`labelRequired` 下两者都缺 ⇒ 一个具名 `VMU_MEETING_LABEL_MISSING`；给一个就给回一个；给两个就
//      四个读面读回同一形状；**不传 labelRequired 时仍然可开**（既有 ~70 个无标题 convene 不被误伤）；
//   ⑥ 真辩论会（四步骨架 + 两次发言 + 一个动议）读回 `skeletonSteps/speeches/motions/present` 的真数字，
//      `means` 逐字段说明这些是**计数**、不是步骤序号，且发完言后 `skeletonSteps` 不变（它是推荐清单的长度）。
//
// RULE E: every loop is preceded by an explicit NON-EMPTY assertion.

import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const { createMeetings } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'meetings.js')).href)
const procMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'meeting-procedures.js')).href)

const BENCH = [
  { id: 'r-acad', slot: 'chair', state: 'live' },
  { id: 'r-1', slot: 'member', state: 'live' },
  { id: 'r-2', slot: 'member', state: 'live' },
]
/** A real kernel over a three-member bench. `seats` is the v5r voter-seat policy (`settings/defaults.json`). */
const makeMeetings = ({ seats = ['chair', 'member'] } = {}) => {
  const clock = { t: 1000 }
  const settings = { get: (key) => (key === 'vmu.meetings.eligibleSeats' ? seats.slice() : undefined) }
  const kernel = createMeetings({ clock: () => clock.t, members: { roster: () => BENCH.slice() }, settings })
  return { kernel, clock }
}
/** Run a call and return `{ok, code, message, hint, value}` instead of throwing. */
const attempt = (fn) => {
  try { return { ok: true, value: fn() } }
  catch (err) { return { ok: false, code: err && err.code, message: err && err.message, hint: err && err.hint } }
}
const sorted = (list) => (Array.isArray(list) ? list.map(String).sort() : list)
const CONVENE = { chair: 'r-acad', actor: 'r-acad', subject: 'p-1', materials: '辩论议程' }

try {
  // ── ① E9：显式 members 子集真的收窄名单 ──────────────────────────────────────────────────────────────────
  console.log('=== 1. INVITING A SUBSET NARROWS THE ROSTER, ON EVERY READ FACE (E9) ===')
  const { kernel: k1 } = makeMeetings()
  const o1 = k1.open(Object.assign({ id: 'm1', type: 'debate', members: ['r-acad', 'r-1'] }, CONVENE))
  ok(o1.ok === true, 'the convene with an explicit members list succeeds', o1.meeting)
  ok(JSON.stringify(sorted(o1.roster)) === JSON.stringify(['r-1', 'r-acad']),
    '★ the open receipt roster is EXACTLY the named members (not the whole bench)', o1.roster)
  ok(o1.rosterNarrowed === true && o1.rosterSource === 'members',
    '★ the receipt says rosterNarrowed:true and which input named the list', { narrowed: o1.rosterNarrowed, source: o1.rosterSource })
  ok(o1.benchSize === 3, 'benchSize says how many live members existed (so "narrowed" is comparable)', o1.benchSize)
  ok(typeof o1.rosterMeans === 'string' && o1.rosterMeans.includes('INVITATION LIST') && o1.rosterMeans.includes('rosterNarrowed'),
    '★ rosterMeans says what the list IS (an invitation list) and what the flag means', o1.rosterMeans && o1.rosterMeans.slice(0, 80))
  ok(o1.receipt && JSON.stringify(sorted(o1.receipt.roster)) === JSON.stringify(['r-1', 'r-acad']) && o1.receipt.rosterNarrowed === true,
    'the receipt envelope carries the same roster + flag (not only the top level)', o1.receipt && o1.receipt.roster)

  const v1 = k1.meetingView({ meeting: 'm1' })
  ok(JSON.stringify(sorted(v1.roster)) === JSON.stringify(['r-1', 'r-acad']),
    '★ meetingView.roster is the narrowed list (the face `vibe_vmu_meeting {action:"status"}` returns)', v1.roster)
  ok(v1.rosterNarrowed === true && v1.rosterSource === 'members' && v1.benchSize === 3,
    'meetingView says the roster was narrowed, by which input, over how big a bench', { narrowed: v1.rosterNarrowed, source: v1.rosterSource, bench: v1.benchSize })
  ok(JSON.stringify(sorted(v1.present)) === JSON.stringify(['r-acad']) && v1.presentCount === 1,
    'present names the member actually seated (the chair), not a count of the bench', v1.present)
  ok(Array.isArray(v1.presentOutsideRoster) && v1.presentOutsideRoster.length === 0,
    'nobody is present outside the invitation list', v1.presentOutsideRoster)
  ok(JSON.stringify(sorted(v1.eligible)) === JSON.stringify(['r-1', 'r-acad']) && v1.eligibleRestricted === true,
    '★ eligible is exactly the invited members who hold a voter seat — r-2 is NOT eligible here', v1.eligible)
  ok(v1.eligibleUniverse === 'this meeting roster' && Array.isArray(v1.eligibleSeats) && v1.eligibleSeats.length === 2,
    'eligibility names its universe and the declared seats it intersected', { universe: v1.eligibleUniverse, seats: v1.eligibleSeats })

  const s1 = k1.summary({ meeting: 'm1' })
  ok(JSON.stringify(sorted(s1.roster)) === JSON.stringify(['r-1', 'r-acad']) && s1.rosterNarrowed === true,
    '★ summary carries the same narrowed roster (one fact, two faces)', { roster: s1.roster, narrowed: s1.rosterNarrowed })
  ok(JSON.stringify(sorted(s1.present)) === JSON.stringify(['r-acad']) && JSON.stringify(sorted(s1.eligible)) === JSON.stringify(['r-1', 'r-acad']),
    'summary carries the same present/eligible universe', { present: s1.present, eligible: s1.eligible })

  const e1 = k1.eligibleVoterIds({ meeting: 'm1' })
  ok(JSON.stringify(sorted(e1.ids)) === JSON.stringify(['r-1', 'r-acad']) && e1.universe === 'this meeting roster' && e1.meeting === 'm1',
    '★ eligibleVoterIds({meeting}) excludes the uninvited bench member (the ballot face now honours the roster)', e1)
  const eAll = k1.eligibleVoterIds()
  ok(JSON.stringify(sorted(eAll.ids)) === JSON.stringify(['r-1', 'r-2', 'r-acad']) && eAll.meeting === null,
    'without a meeting the deployment-wide eligible list is unchanged (backwards compatible)', eAll)

  const a1 = k1.attend({ meeting: 'm1', member: 'r-1' })
  ok(a1.ok === true, 'r-1 attends', a1.quorum && a1.quorum.present)
  const v1b = k1.meetingView({ meeting: 'm1' })
  ok(JSON.stringify(sorted(v1b.present)) === JSON.stringify(['r-1', 'r-acad']) && v1b.presentCount === 2,
    '★ after attending, present names both seated members (sorted ids, not a number)', v1b.present)
  ok(JSON.stringify(sorted(v1b.roster)) === JSON.stringify(['r-1', 'r-acad']) && v1b.rosterNarrowed === true,
    'the roster is still the invitation list after attend (attend adds PRESENCE, not an invitation)', v1b.roster)

  // ── ② E9：roster 别名 + 主席不在名单里 ───────────────────────────────────────────────────────────────────
  console.log('=== 2. THE `roster` ALIAS WORKS, AND A CHAIR OUTSIDE THE LIST IS NAMED ===')
  const { kernel: k2 } = makeMeetings()
  const o2 = k2.open({ id: 'm2', type: 'ordinary', chair: 'r-acad', roster: ['r-1'] })
  ok(JSON.stringify(o2.roster) === JSON.stringify(['r-1']) && o2.rosterNarrowed === true && o2.rosterSource === 'roster',
    '★ the same narrowing under the other input name (`roster`)', { roster: o2.roster, source: o2.rosterSource })
  const v2 = k2.meetingView({ meeting: 'm2' })
  ok(JSON.stringify(v2.present) === JSON.stringify(['r-acad']) && JSON.stringify(v2.presentOutsideRoster) === JSON.stringify(['r-acad']),
    '★ the chair is seated at open even though it is outside the invitation list, and that fact is named', { present: v2.present, outside: v2.presentOutsideRoster })
  ok(JSON.stringify(sorted(v2.eligible)) === JSON.stringify(['r-1']),
    'and an uninvited chair is not eligible to vote in this meeting (eligibility is the roster, not the bench)', v2.eligible)

  // ── ③ 默认行为：不给子集 ⇒ 原样 ────────────────────────────────────────────────────────────────────────────
  console.log('=== 3. NO SUBSET KEEPS TODAY\'S ROSTER; THE FULL BENCH IS NOT A NARROWING ===')
  const { kernel: k3 } = makeMeetings()
  const o3 = k3.open({ id: 'm3', type: 'ordinary', chair: 'r-acad', roster: ['r-acad', 'r-1', 'r-2'] })
  ok(o3.rosterNarrowed === false && o3.rosterSource === 'roster' && o3.roster.length === 3,
    '★ a list that IS the whole bench reads rosterNarrowed:false (the flag must mean something)', { narrowed: o3.rosterNarrowed, roster: o3.roster })
  const o4 = k3.open({ id: 'm4', type: 'ordinary', chair: 'r-acad' })
  ok(o4.rosterNarrowed === false && o4.rosterSource === 'default' && Array.isArray(o4.roster) && o4.roster.length === 0,
    'no list at all keeps the caller-supplied roster (empty here) and says the source is the default', { roster: o4.roster, source: o4.rosterSource })
  ok(k3.meetingView({ meeting: 'm4' }).benchSize === 3,
    'even the default convene reports the bench size it declined to narrow from', k3.meetingView({ meeting: 'm4' }).benchSize)

  // ── ④ E9 拒绝：空名单/非数组/空字符串，且不留会议 ───────────────────────────────────────────────────────
  console.log('=== 4. A BAD INVITATION LIST IS REFUSED BY NAME AND LEAVES NO MEETING ===')
  const { kernel: k4 } = makeMeetings()
  const emptyList = attempt(() => k4.open(Object.assign({ id: 'bad1', members: [] }, CONVENE)))
  ok(emptyList.ok === false && emptyList.code === 'VMU_INVALID_ARGUMENT' && /names nobody/.test(emptyList.message),
    '★ an explicitly empty members list is refused by name (reading it as "everyone" would be the old defect)', emptyList)
  const notArray = attempt(() => k4.open(Object.assign({ id: 'bad2', members: 'r-1' }, CONVENE)))
  ok(notArray.ok === false && notArray.code === 'VMU_INVALID_ARGUMENT' && /ARRAY/.test(notArray.message),
    'a non-array members value is refused with the expected shape', notArray)
  const badEntry = attempt(() => k4.open(Object.assign({ id: 'bad3', members: ['r-1', ''] }, CONVENE)))
  ok(badEntry.ok === false && badEntry.code === 'VMU_INVALID_ARGUMENT' && /members\[1\]/.test(badEntry.message),
    'a blank member id is refused with its INDEX (not silently dropped)', badEntry)
  const rosterNotArray = attempt(() => k4.open({ id: 'bad4', roster: 'r-1' }))
  ok(rosterNotArray.ok === false && rosterNotArray.code === 'VMU_INVALID_ARGUMENT' && /roster must be an ARRAY/.test(rosterNotArray.message),
    'the roster alias is validated the same way', rosterNotArray)
  const live = k4.status().liveMeetings || []
  ok(!['bad1', 'bad2', 'bad3', 'bad4'].some((id) => live.includes(id)),
    '★ none of the refused convenes left a meeting behind (a refused open is not half-applied)', live)

  // ── ⑤ E6：kind/title 读回，以及"都缺"的具名拒 ────────────────────────────────────────────────────────────
  console.log('=== 5. kind/title ARE READABLE BACK, AND A MEETING WITH NEITHER IS REFUSED BY NAME (E6) ===')
  const { kernel: k5 } = makeMeetings()
  const noLabel = attempt(() => k5.open({ id: 'lab1', type: 'ordinary', chair: 'r-acad', actor: 'r-acad', labelRequired: true }))
  ok(noLabel.ok === false && noLabel.code === 'VMU_MEETING_LABEL_MISSING',
    '★ ONE code names the missing meaningful label: VMU_MEETING_LABEL_MISSING', noLabel.code)
  ok(/kind/.test(noLabel.message) && /title/.test(noLabel.message) && /meaningful label/.test(noLabel.message),
    'the message names BOTH fields and what is missing (a label a reader could use)', noLabel.message)
  ok(typeof noLabel.hint === 'string' && /kind:"/.test(noLabel.hint) && /title:"/.test(noLabel.hint),
    'the hint says how to fix it, with both spellings', noLabel.hint)
  ok((k5.status().liveMeetings || []).includes('lab1') === false, 'the refused convene left no meeting', k5.status().liveMeetings)

  const titleOnly = k5.open({ id: 'lab2', type: 'ordinary', chair: 'r-acad', actor: 'r-acad', title: 'Weekly sync', labelRequired: true })
  ok(titleOnly.ok === true && titleOnly.title === 'Weekly sync' && titleOnly.kind === null,
    'a title alone satisfies the rail (one meaningful label is enough)', { title: titleOnly.title, kind: titleOnly.kind })
  ok(k5.meetingView({ meeting: 'lab2' }).title === 'Weekly sync' && k5.meetingView({ meeting: 'lab2' }).kind === null,
    'meetingView reads the title back and says kind is absent (null, not undefined)', k5.meetingView({ meeting: 'lab2' }))

  const kindOnly = k5.open({ id: 'lab3', type: 'ordinary', chair: 'r-acad', actor: 'r-acad', kind: 'division', labelRequired: true })
  ok(kindOnly.ok === true && kindOnly.kind === 'division' && kindOnly.title === null,
    'a kind alone also satisfies the rail', { kind: kindOnly.kind, title: kindOnly.title })
  ok(k5.summary({ meeting: 'lab3' }).kind === 'division' && k5.meetingView({ meeting: 'lab3' }).kind === 'division',
    '★ kind is readable back on BOTH faces (it used to be write-only)', { summary: k5.summary({ meeting: 'lab3' }).kind, view: k5.meetingView({ meeting: 'lab3' }).kind })

  const both = k5.open({ id: 'lab4', type: 'division', chair: 'r-acad', actor: 'r-acad', kind: 'division', title: 'Budget division', labelRequired: true })
  const v4 = k5.meetingView({ meeting: 'lab4' })
  const s4 = k5.summary({ meeting: 'lab4' })
  ok(both.kind === 'division' && both.title === 'Budget division' && both.receipt.kind === 'division' && both.receipt.title === 'Budget division',
    '★ both labels are echoed on the return AND the receipt in the same shape', { ret: [both.kind, both.title], rec: [both.receipt.kind, both.receipt.title] })
  ok(v4.kind === 'division' && v4.title === 'Budget division' && s4.kind === 'division' && s4.title === 'Budget division',
    '★ meetingView and summary read back the SAME two labels', { view: [v4.kind, v4.title], summary: [s4.kind, s4.title] })

  const unlabelled = k5.open({ id: 'lab5', type: 'ordinary', chair: 'r-acad', actor: 'r-acad' })
  ok(unlabelled.ok === true && unlabelled.kind === null && unlabelled.title === null,
    '★ WITHOUT labelRequired an unlabelled convene still opens (the rail is opt-in; the kernel\'s own callers are not broken)', unlabelled.kind)

  // ── ⑥ E36：procedureProgress 是计数，不是步骤序号 ─────────────────────────────────────────────────────────
  console.log('=== 6. procedureProgress COUNTS WHAT HAPPENED, IN A REAL DEBATE (E36) ===')
  const { kernel: k6 } = makeMeetings()
  const proc = procMod.procedureFor('debate')
  ok(proc && proc.procedure && Array.isArray(proc.procedure.steps) && proc.procedure.steps.length === 4,
    'precondition: the debate skeleton has four steps and is a recommendation', proc && proc.procedure && { steps: proc.procedure.steps.length, binding: proc.procedure.binding })
  k6.open(Object.assign({ id: 'd1', type: 'debate', members: ['r-acad', 'r-1', 'r-2'], procedure: proc }, CONVENE))
  const p0 = k6.meetingView({ meeting: 'd1' }).procedureProgress
  ok(p0.skeletonSteps === 4, '★ skeletonSteps is 4 on a real convene (it used to read 0: the pack nests steps one level deeper)', p0.skeletonSteps)
  ok(p0.skeletonBinding === 'recommendation', 'the binding travels too (a recommendation, not a gate)', p0.skeletonBinding)
  ok(p0.speeches === 0 && p0.motions === 0 && p0.queued === 0 && p0.present === 1 && p0.advancing === false,
    'nothing has happened yet: the counts are 0 except the one seated member', p0)

  k6.attend({ meeting: 'd1', member: 'r-1' })
  k6.speak({ meeting: 'd1', member: 'r-1', text: '我支持这个命题，给出当前概率 0.8。' })
  k6.speak({ meeting: 'd1', member: 'r-acad', text: '主席追问：0.8 的依据是哪一段代码？' })
  k6.motion({ meeting: 'd1', member: 'r-1', kind: 'adopt', text: '建议采纳该结论。' })
  const p1 = k6.meetingView({ meeting: 'd1' }).procedureProgress
  ok(p1.skeletonSteps === 4, '★ skeletonSteps is STILL 4 after acting — it counts the recommendation, not progress through it', p1.skeletonSteps)
  ok(p1.speeches === 2, '★ speeches counts the two recorded speeches', p1.speeches)
  ok(p1.motions === 1, '★ motions counts the one raised motion', p1.motions)
  ok(p1.present === 2, '★ present counts the two seated members', p1.present)
  ok(p1.queued === 0, 'queued is 0 (nobody is waiting on the floor queue)', p1.queued)
  ok(p1.advancing === true, 'advancing is true because acts are on record', p1.advancing)
  ok(typeof p1.means === 'string' && /every field here is a COUNT/.test(p1.means) && /None of them is a step index/.test(p1.means),
    '★ means says these are COUNTS, and that none of them is a step index', p1.means && p1.means.slice(0, 90))
  ok(/skeletonSteps counts the steps/.test(p1.means) && /speeches counts speech entries/.test(p1.means) && /motions counts motions raised/.test(p1.means),
    'means explains each count field by field (a reader cannot mistake one for progress)', p1.means)
  const s6 = k6.summary({ meeting: 'd1' }).procedureProgress
  ok(s6.skeletonSteps === p1.skeletonSteps && s6.speeches === p1.speeches && s6.motions === p1.motions && s6.present === p1.present,
    '★ summary reads the same numbers as the status face (two readers, one fact)', s6)
} catch (err) {
  failed++
  failures.push('suite crashed: ' + (err && err.stack ? err.stack.split('\n')[0] : String(err)))
  console.error('  FAIL suite crashed: ' + (err && err.stack ? err.stack : err))
}

console.log('\n=== VMU WAVE2 MEETING ROSTER/LABEL/COUNTS: ' + passed + ' passed, ' + failed + ' failed ===')
console.log(failed === 0 ? 'ALL GREEN' : 'FAILURES: ' + failures.length)
process.exit(failed > 0 ? 1 : 0)
