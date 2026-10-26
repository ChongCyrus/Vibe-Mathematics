// vibe-math-vmu —— 第 19 次真机验收暴露的两个「读数不在位」缺陷的常驻断言。
//
// 为什么存在（纪律：能跑 ≠ 被守住）：第 19 次真机是一次真实的多代理跑（所办 + 真子代理），它自己的验收报告点名两件事——
//   ① ⑩.1/⑬.3：`childSessionId` 是 null，**而同一条回执里 `delegation.childId` 明明有值**——读点找的是
//      `delivery.childSessionId`/`sessionId`，seam 报的是 `delivery.childId`。同一「答案在下一层没上来」家族的第三次。
//   ② 结题段：`vibe_v5_report` 在 SERVICE 会议 close 之后仍报「开着的 1 场」，而 status/再次 close 说它已不存在——
//      两个面给出同一对象的两个读数（`openMeetings()` 读的是持久标记行，close 只把会议从 live 挪进 archive）。
// 修法：①三个拼写都读，并在 `childSessionIdMeans` 里点名读到的是哪一个；②`openMeetings()` 与 live 会议服务合并，
// 已归档的 id 绝不报 open，live 里标记没见过的会议被补上，两个方向都**计数**（不是静默过滤）。
// 反断言见第 ②段：一个不存在的 archived id 必须**不**被误删，live 会议必须真的被补上一次。
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'
import { createMembers } from '../vibe-math-vmu/kernel/members.js'
import { createTurnOrchestrator } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'

let passed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; return }
  failures.push(name + (detail === undefined ? '' : ' [' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)) + ']'))
}
const NOW = 1700000000000
const rec = (m) => (key) => m[key]

// ── ① 子会话 id 必须从 seam 真正报的位置读出来 ───────────────────────────────────────────────
{
  const seen = []
  const loop = createTurnOrchestrator({
    sectionPolicy: () => [],
    prompt: createPromptPipeline({ sections: [] }),
    turnFacts: () => ({ roster: [], rosterIds: [], chairId: null, roleLabel: null, quorum: { required: 0, met: true } }),
    // the seam reports `childId` (NOT childSessionId) — exactly what host-deliver.js does for activation delivery.
    deliver: async () => ({ reply: '```json\n{"progress":"ok"}\n```', childId: 'child-9', stopReason: 'completed', deliveryPath: 'activation', attribution: 'test seam' }),
    faces: {},
  })
  // ★ SHAPE: a SINGLE-member step returns the settled receipt at the TOP level; a multi-member step returns
  // `receipts[]`. Both are read here so the assertion cannot pass just because it looked at the wrong shape.
  const st = await loop.step({ members: ['r-1'], why: 'child id must travel' })
  seen.push(st)
  const settled = st.receipts && st.receipts[0] ? st.receipts[0] : st
  ok(settled.childSessionId === 'child-9',
    '①a. ★★★ `childSessionId` reads `delegation.childId` — the field the seam actually reports (run 19 ⑩.1)', { childSessionId: settled.childSessionId, delegation: settled.delegation })
  ok(typeof settled.childSessionIdMeans === 'string' && settled.childSessionIdMeans.includes('delivery.childId'),
    '①b. ★★ and `childSessionIdMeans` NAMES which spelling answered, so an absent id is distinguishable from an unread one', settled.childSessionIdMeans)
  ok(settled.deliveryPath === 'activation',
    '①c. ★ the SETTLED receipt now carries `deliveryPath` at the top level too (it used to exist only nested in receipt.delivery)', { deliveryPath: settled.deliveryPath, means: settled.deliveryPathMeans })
  ok(typeof settled.memberToolCallsMeans === 'string' && settled.memberToolCalls === null,
    '①d. ★★ and the member-call counts stay null-with-a-reason in a child-kernel delivery (null = NOT READABLE, never "zero calls")', { memberToolCalls: settled.memberToolCalls, means: settled.memberToolCallsMeans })
}

// ── ② openMeetings() 必须与 live 会议服务合并（已归档的 id 绝不报 open） ───────────────────────
{
  // a durable marker that knows two meetings: one of them the service has ALREADY archived.
  const rows = [
    { id: 'm-closed', state: 'open' }, // stale marker row for a meeting the service closed
    { id: 'm-open', state: 'lapsed' }, // a live-ish marker row the service also knows as scheduled
  ]
  const meetings = createMeetings({ clock: () => NOW, settings: rec({}), durable: { read: () => rows } })
  const members = createMembers({ clock: () => NOW })
  // one meeting the service really has open, one the marker already claims is closed
  const opened = meetings.open({ id: 'm-open', chair: 'r-1', actor: 'r-1', roster: ['r-1', 'r-2'], at: NOW })
  meetings.open({ id: 'm-closed', chair: 'r-1', actor: 'r-1', roster: ['r-1'], at: NOW })
  meetings.close({ meeting: 'm-closed', actor: 'r-1', at: NOW + 1000 })
  const view = meetings.openMeetings()
  const ids = (view.meetings || []).map((r) => String(r.id))
  ok(!ids.includes('m-closed'),
    '②a. ★★★ a meeting the SERVICE has archived is never reported open, even though the durable marker still says open (run 19 结题段)', { ids, droppedClosed: view.droppedClosed })
  ok(view.droppedClosed === 1,
    '②b. ★★ and the exclusion is COUNTED, not silently dropped', { droppedClosed: view.droppedClosed })
  ok(ids.includes('m-open'),
    '②c. ★ the live meeting survives the merge', { ids })
  // RULE E shape A (round 30 / task-4): `every()` on a receiver computed INSIDE the assertion is true on an empty
  // set, so "no row matched" passed as "the matching row is fine". The rows are computed FIRST and their count is
  // asserted (=== 1) before `every()` - the premise is a measurement now, and the assertion is strictly stronger.
  const openRows = view.meetings.filter((r) => String(r.id) === 'm-open')
  ok(openRows.length === 1 && openRows.every((r) => r.state === 'scheduled' || r.state === 'open'),
    '②d. ★★ its STATE is the service\'s schedule-aware state, not the stale marker label', view.meetings)
  ok(view.source === 'marker+service',
    '②e. ★ the receipt names that two sources were merged, so a reader is not told one view is the whole truth', { source: view.source })
  // 反方向：标记没见过的 live 会议必须被补上并计数（不是只做过滤）
  const fresh = createMeetings({ clock: () => NOW, settings: rec({}), durable: { read: () => [] } })
  fresh.open({ id: 'm-hidden', chair: 'r-1', actor: 'r-1', roster: ['r-1'], at: NOW })
  const v2 = fresh.openMeetings()
  ok(v2.meetings.some((r) => String(r.id) === 'm-hidden') && v2.addedFromService === 1,
    '②f. ★★ 反方向：a live meeting the marker never saw is ADDED and counted (the merge is not a one-way filter)', v2)
  // 反断言：没有 archive 也没 live 的时候，合并不得凭空捏造
  const empty = createMeetings({ clock: () => NOW, settings: rec({}), durable: { read: () => [] } })
  const v3 = empty.openMeetings()
  ok(v3.meetings.length === 0 && v3.droppedClosed === 0 && v3.addedFromService === 0,
    '②g. ★★ 反：空所不得被合并「补」出会议，两个计数器都必须是 0', v3)
}

const dirCleanupProbe = await mkdtemp(join(tmpdir(), 'vmu-run19-'))
try { /* nothing written; the probe only proves the import surface exists */ } finally { await rm(dirCleanupProbe, { recursive: true, force: true }).catch(() => {}) }

if (failures.length) { console.log('FAIL ' + failures.length + ' / passed ' + passed); for (const f of failures) console.log('- ' + f) } else console.log('=== VMU RUN 19 FINDINGS: ' + passed + ' passed, 0 failed ===')
process.exit(failures.length ? 1 : 0)
