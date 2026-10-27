#!/usr/bin/env node
// vmu RUN 50 — A DECISION MADE IN ANOTHER KERNEL MUST NOT READ AS "STILL OPEN", AND A READ MUST SAY WHAT IT OMITS.
//
// THE OBSERVED DEFECTS (live run 50, the office's own report — seven of them, F-28../F-34):
//   F-28  the chair closed m2; the office's kernel read `summary`/`status` and got the MAIN field `state:"open"`
//         (only `liveWhileArchived:true` and `archivedView` disagreed). A closure that is decided and stated and then
//         reads as open is worse than an error: nothing tells the reader which field to believe.
//   F-29  the debate gate's note ASSERTED "Lean 作业未通过" about a file the chair had just built successfully — the gate
//         never received that evidence and wrote a verdict about a fact it did not measure.
//   F-30  the close receipt carried `closeSemantics:"service-archives"` and nothing to check it against (no `state`, no
//         `subjectGate`): the closer had to make a second call to learn what the meeting had become.
//   F-31  `chat status` printed `muted:["r-2"]` with no expiry, no reason, no author — the only way to learn when a mute
//         lapses was to send once and read the refusal (`VMU_CHAT_MUTED` already carries `until`).
//   F-32  the same tool wrote `owner:"vibe_v5_feedback"` (office call) and `owner:"r-2"` (member call): a TOOL NAME is not
//         an author, and null + the ledger's own `bySource` is the honest answer.
//   F-33  the member's status board printed a mid-sentence cut with no marker saying it WAS a cut.
//   F-34  `approvalState` pending answered `decidedByMeans:null`, which reads as "field missing", not "nobody decided".
//
// WHAT THIS SUITE PROVES: (1) a close in one kernel reaches a reader kernel's summary/status (the live copy is evicted,
// and the read refreshes first); (2) the gate note claims only what it measured; (3) the close receipt states the state,
// the archive fact and the gate verdict; (4) the mute read carries until/reason/by; (5) feedback rows record an author or
// null, never a tool name; (6) a truncated board line says it is an excerpt and names the record; (7) pending approvals
// say in words that nobody has decided.
import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { statusBoardReadings, renderStatusBoard } from '../vibe-math-vmu/kernel/turn/index.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const entry = await import(pathToFileURL(ENTRY).href)
let NOW = 1000
const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async (spec) => { state.specs.push(spec); return () => {} } } }
  const handle = entry.apply(ctx, Object.assign({ clock: () => NOW, packs: ['v5r'] }, config))
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const callJSON = async (b, name, args = {}, ctx = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, ctx) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
}

const root = await mkdtemp(join('D:/_tmp', 'vmu-run50-readbacks-'))
try {
  const a = await boot({ root })
  const kA = a.handle.kernel
  await kA.members.hire({ id: 'r-a', slot: 'chair' })

  const card = await callJSON(a, 'vibe_v5_record_proposition', {
    member: 'r-a', statement: '第50轮：对任意整数 n，n^3-n 可被 6 整除。', value: 0.8, motive: 'run 50 复验', p: 0.9,
    proof_ref: 'Formal/p50.lean#div6', proof_state: 'complete',
  }, { kernel: kA })
  const cardId = card.parsed && card.parsed.recordId
  ok(!!cardId, 'a card with a declared proof exists (F-29/F-30 fixture)', card)

  // ── ① F-28 — a close in ONE kernel must not read as "open" in ANOTHER ────────────────────────────────────
  const opened = await callJSON(a, 'vibe_v5_meeting', { type: 'debate', subject: cardId, agenda: '第50轮：跨内核的关闭要读得到', member: 'r-a' }, { kernel: kA })
  const mid = opened.parsed && opened.parsed.meeting
  ok(!!mid, 'the debate was convened in the first kernel', opened)
  await sleep(60)
  const b = await boot({ root })
  const kB = b.handle.kernel
  const before = kB.meetings.summary({ meeting: mid })
  ok(before && before.state === 'open', 'the second kernel initially sees the meeting open (it adopted the live row)', before && before.state)

  const closed = kA.meetings.close({ meeting: mid, actor: 'r-a' })
  ok(closed && closed.thrown !== true, 'the first kernel closed it', closed)
  await sleep(60)
  const after = kB.meetings.summary({ meeting: mid })
  ok(after && after.state === 'closed', 'the reader kernel now reads it CLOSED (the live copy was ended by the closure it learned, and the read refreshed first)', after && { state: after.state, liveWhileArchived: after.liveWhileArchived })
  ok(after && !after.liveWhileArchived, 'and the contradictory flag is gone (nothing says "live but archived" any more)', after && after.liveWhileArchived)

  // ── ② F-29 — the gate note claims only what it measured ─────────────────────────────────────────────────
  const receiptGate = opened.parsed && opened.parsed.subjectGate
  ok(receiptGate && typeof receiptGate.note === 'string', 'the convening receipt carries the gate note', receiptGate)
  ok(receiptGate && !/Lean 作业未通过/.test(receiptGate.note), 'the note no longer ASSERTS that the Lean job failed (it never received the job)', receiptGate && receiptGate.note)
  ok(receiptGate && /没核/.test(receiptGate.note), 'it says what it DID check: the card\'s two declared fields', receiptGate && receiptGate.note)
  ok(receiptGate && receiptGate.proofBasis === 'declaration-only', 'and the basis is still declared-only (the admission is not upgraded)', receiptGate && receiptGate.proofBasis)

  // ── ③ F-30 — the close receipt states what the close did, read back from the archive ─────────────────────
  const svcMeet = await callJSON(a, 'vibe_v5_meeting', { type: 'ordinary', agenda: '第50轮：关会回执要自己说清', member: 'r-a' }, { kernel: kA })
  const svcId = svcMeet.parsed && svcMeet.parsed.meeting
  ok(!!svcId, 'a service meeting exists to close', svcMeet)
  const closeReceipt = await callJSON(a, 'vibe_vmu_meeting', { action: 'close', id: svcId, actor: 'r-a' }, { kernel: kA })
  const cr = closeReceipt.parsed
  ok(cr && cr.ok === true, 'the service close succeeded', closeReceipt)
  ok(cr && cr.state === 'closed', 'the receipt states the meeting\'s state after the close (not only "service-archives")', cr && cr.state)
  ok(cr && cr.archived === true && /ARCHIVE/.test(String(cr.archivedMeans)), 'and states the archive fact with words', cr && cr.archivedMeans)
  ok(cr && cr.subjectGate === null, 'an ordinary meeting\'s receipt says null rather than inventing a gate', cr && cr.subjectGate)

  // ── ④ F-31 — the mute READ carries until / reason / by ───────────────────────────────────────────────────
  kA.chat.mute('r-a', { by: 'r-a', durationMs: 60000, reason: '第50轮：读面要给出到期时间' })
  const chatStatus = kA.chat.status()
  ok(Array.isArray(chatStatus.mutedDetail) && chatStatus.mutedDetail.length === 1, 'status prints one detail row per live mute', chatStatus.mutedDetail)
  const row0 = chatStatus.mutedDetail && chatStatus.mutedDetail[0]
  ok(row0 && row0.member === 'r-a', 'naming the member', row0 && row0.member)
  ok(row0 && typeof row0.until === 'number' && row0.until > 0, 'the row carries the expiry instant (so a reader need not send to learn it)', row0 && row0.until)
  ok(row0 && row0.reason === '第50轮：读面要给出到期时间', 'the reason is on the read face', row0 && row0.reason)
  ok(row0 && row0.by === 'r-a', 'and who imposed it', row0 && row0.by)
  ok(chatStatus && /SEAT token/.test(String(chatStatus.adminsMeans)), 'admins says its name space (a seat token is not a member id)', chatStatus.adminsMeans)

  // ── ⑤ F-32 — a feedback row records an author or NULL, never a tool name ─────────────────────────────────
  const fbArgs = { op: 'add', category: 'test-office', route: 'fixture', phenomenon: 'run 50 的作者归属', impact: '读者要能知道是谁写的', action: '记 null 或成员 id' }
  const fbArgsMember = Object.assign({}, fbArgs, { category: 'test-member' })
  const fbOffice = await callJSON(a, 'vibe_v5_feedback', fbArgs, { kernel: kA })
  ok(fbOffice.parsed && fbOffice.parsed.ok === true, 'the office-side feedback call succeeded', fbOffice)
  const fbMember = await callJSON(a, 'vibe_v5_feedback', Object.assign({}, fbArgsMember, { member: 'r-a' }), { kernel: kA })
  ok(fbMember.parsed && fbMember.parsed.ok === true, 'the member-side call succeeded', fbMember)
  await sleep(40)
  const listed = kA.records.list({ track: 'feedback', limit: 0 })
  const heads = Array.isArray(listed) ? listed : (Array.isArray(listed && listed.items) ? listed.items : [])
  const latest = heads.slice(-2)
  ok(latest.length === 2, 'the two rows are in the ledger', latest.length)
  ok(latest.length === 2 && latest[0].owner === null, 'a call without `member` records NO author (null, not the tool name)', latest[0] && latest[0].owner)
  ok(latest.length === 2 && latest[1].owner === 'r-a', 'a call WITH `member` records that member', latest[1] && latest[1].owner)

  // ── ⑥ F-33 — a truncated board line says it is an excerpt and names the whole record ────────────────────
  const longBody = '整数 n 的三次方减 n 恒为六的倍数：因为 n^3-n=(n-1)n(n+1) 是连续三个整数之积，必有一项被 3 整除、必有一项为偶数，故乘积被 6 整除；这个结论在本轮用普通数学证明，不依赖形式化工具，也不依赖任何未登记的外部结论，边界条件 n=0 与 n=-1 也成立，因为零与负数的情形同样落入连续三个整数之积的结构。'
  const boardRec = {
    list: ({ track } = {}) => (String(track) === 'progress' ? [{ id: 'rec-50', track: 'progress', kind: 'progress', title: '第50轮：长正文的摘录', body: longBody, owner: 'r-a', updatedAt: 1000, recordedAt: 1000, status: 'live', rev: 1 }] : []),
    get: ({ id } = {}) => (String(id) === 'rec-50' ? { id: 'rec-50', body: longBody } : null),
  }
  const ids = statusBoardReadings({ records: boardRec, member: 'r-a', settings: {}, at: NOW })
  const rendered = renderStatusBoard(ids)
  ok(/摘录；完整正文见记录 rec-50/.test(rendered), 'the board says the line IS an excerpt and names the record holding the whole body', rendered.split('\n').filter((l) => /当前小任务/.test(l)))
  ok(/…（摘录/.test(rendered), 'the ellipsis is explained, not decorative', rendered.split('\n').filter((l) => /摘录/.test(l)))

  // ── ⑦ F-34 — a pending approval says in words that nobody has decided ──────────────────────────────────
  const req = await callJSON(a, 'vibe_vmu_human', { action: 'openApproval', requestId: 'rq-r50', subject: '第50轮：待批的请求', by: 'r-a' }, { kernel: kA })
  ok(req.parsed && req.parsed.ok === true, 'an approval request exists (pending)', req)
  const st = await callJSON(a, 'vibe_vmu_human', { action: 'approvalState', request_id: 'rq-r50' }, { kernel: kA })
  ok(st.parsed && st.parsed.state === 'pending', 'it reads as pending', st.parsed && st.parsed.state)
  ok(st.parsed && st.parsed.decidedBy === null, 'with no actor to name', st.parsed && st.parsed.decidedBy)
  ok(st.parsed && /nobody has decided/.test(String(st.parsed.decidedByMeans)), 'and the means SAY why the name is absent (not a bare null)', st.parsed && st.parsed.decidedByMeans)
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

console.log('\n=== VMU RUN 50 READBACKS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.log('failures:'); for (const f of failures) console.log('  - ' + f); process.exitCode = 1 }
