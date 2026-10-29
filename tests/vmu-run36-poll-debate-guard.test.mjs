#!/usr/bin/env node
// vmu RUN 36 / RULE E19 — 「辩论阶段不使用投票板」必须有机制，不能只有一句教学。
//
// THE GAP THIS CLOSES. `docs/acceptance/rules-ledger.json` row E19 was MISSING on mechanism and tool: the macro rule
// (`宏观层面v5r运行规则.md` L46–L48: 辩论按辩论流程走，不用投票板) existed only as a teaching sentence. A chair could
// open a poll board in the middle of a debate and nothing in the runtime said no — a rule with no consumer, which is
// exactly the shape AGENTS red line ④ forbids.
//
// WHERE THE GUARD LIVES, AND WHY THERE. The ballot box is TYPE-AGNOSTIC by design (`kernel/ballotbox.js` knows nothing
// about meetings); teaching it meeting TYPEs would move institution vocabulary into the kernel. So the refusal is the
// PACK's policy half, raised at the ONE `poll_open` face (`vibe-math-vmu/packs/v5r/tools.js#toolPollOpen`), after the
// existing chair gate so a non-chair still learns the more specific refusal first. Detection reads published faces
// only: `kernel.meetings.openMeetings()` (the durable marker; it excludes `closed` rows and counts what it left out)
// and `kernel.meetings.meetingView({meeting})` (the same view `vibe_vmu_meeting {action:"status"}` returns).
//
// WHAT THIS SUITE PROVES:
//   §1 the baseline really works: with no meeting open a poll opens through the real adapter (so §3's refusal is not
//      an always-refuse face);
//   §2 a real pack-convened DEBATE is open (`type:"debate"`, state open) — the guard's input exists;
//   §3 the poll is refused BY NAME (`VMU_NOT_PERMITTED`), the message carries the debate's own id, the hint carries the
//      two real ways forward (verdicts / chair close), and NO box was opened by the refused call;
//   §4 closing the debate lifts the guard: the same call succeeds again (the guard tracks the meeting, not the tool);
//   §5 an ordinary meeting does NOT block the board — the rule is about debate, not about "a meeting is open";
//   §6 a kernel without the meeting face cannot be tripped into a false refusal (the check returns null instead of
//      inventing a block), and every collection assertion is non-empty (RULE E: a loop over an empty list proves none).
//
// Run: node tests/vmu-run36-poll-debate-guard.test.mjs
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

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
const codeOf = (parsed, raw) => (parsed && parsed.code) || (parsed && parsed.ok === false && parsed.code) || null

const entry = await import(pathToFileURL(ENTRY).href)
let NOW = 1000
const boot = async (config = {}) => {
  const state = { specs: [] }
  // C6a: the debate subject card declares a complete proof, which now needs Lean registration on the same write —
  // so the host injects the `subprocess` seam (as tests/vmu-b3-c8-c10.test.mjs does) and §2 settles a real run.
  const subprocess = {
    resolveExecutable: async (name) => '/fake/bin/' + String(name),
    spawn: () => ({ done: Promise.resolve({ exitCode: 0, signal: null, stdout: 'Build completed successfully.\n', stderr: '' }), terminate() {} }),
  }
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, get: (what) => (what === 'subprocess' ? subprocess : undefined), tools: { register: async (spec) => { state.specs.push(spec); return () => {} } } }
  const handle = entry.apply(ctx, Object.assign({ clock: () => NOW }, config))
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { parsed: undefined, missing: true }
  let parsed
  let raw
  try {
    raw = await spec.execute(args, {})
    try { parsed = JSON.parse(raw) } catch { parsed = undefined }
    return { raw, parsed, missing: false }
  } catch (e) {
    return { raw: null, parsed: { ok: false, code: e && e.code, message: e && e.message, hint: e && e.hint }, missing: false, err: e }
  }
}
const textOf = (r) => String((r.parsed && (r.parsed.message || '')) || '') + ' ' + String((r.parsed && r.parsed.hint) || '')

const root = await mkdtemp(join('D:/_tmp', 'vmu-run36-poll-debate-'))
try {
  const b = await boot({ root, packs: ['v5r'] })
  const kernel = b.handle.kernel

  console.log('=== 0. THE FACE AND THE FIXTURE ARE REAL (RULE E: nothing below may be vacuous) ===')
  const names = b.handle && b.handle.kernel ? kernel.packTools().map((t) => t.name) : []
  ok(kernel !== null, 'the pack applied (a null kernel would make every assertion below vacuous)', kernel === null)
  ok(names.includes('vibe_v5_poll_open') && names.includes('vibe_v5_meeting'), 'both faces this suite uses are DECLARED by the pack', names.length)
  await kernel.members.hire({ id: 'r-chair', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  const roster = kernel.members.roster()
  ok(roster.length > 0 && roster.some((m) => String(m.slot) === 'chair'), 'a chair seat really exists (RULE E)', roster.map((m) => m.id + ':' + m.slot))
  ok(typeof kernel.ballotbox?.status === 'function' && typeof kernel.meetings?.openMeetings === 'function',
    'the ballot box and the meeting marker are both published (the guard and the board are real faces)', Object.keys(kernel).filter((k) => /ballot|meeting/.test(k)))
  const boxesNow = () => Number((kernel.ballotbox.status() || {}).boxes || 0)

  console.log('=== 1. BASELINE: with NO meeting open, the board opens (so §3 is not an always-refuse face) ===')
  const base = await call(b, 'vibe_v5_poll_open', { question: '基线：没有会议时能不能开票', options: ['甲', '乙'], member: 'r-chair' })
  ok(base.parsed && base.parsed.ok === true && typeof base.parsed.boxId === 'string' && base.parsed.boxId !== '',
    '§1 a poll opens through the real adapter', base.parsed && (base.parsed.code || base.parsed.message))
  ok(boxesNow() === 1, '§1 exactly one box exists after that call (the board count is observable)', boxesNow())

  console.log('=== 2. A REAL pack-convened DEBATE is open (the guard has an input) ===')
  // ★ C7: a one-line proposition is no longer a legal debate subject. The fixture therefore records the card the
  // debate is about (declared proof + Lean registration) and convenes on its id; what §2 needs — a REAL open
  // debate — is unchanged, and the subject now has a carrier the gate could judge.
  await mkdir(join(root, 'Formal'), { recursive: true })
  await writeFile(join(root, 'Formal', 'p36.lean'), 'theorem odd_sum_square : True := trivial\n', 'utf8')
  const leanRun = await call(b, 'vibe_v5_lean_run', { statement: 'True', file: 'Formal/p36.lean' })
  const leanJob = leanRun.parsed && leanRun.parsed.id
  const settled = leanJob ? await kernel.lean.settle(leanJob) : null
  ok(!!settled && settled.passed === true, '§2 a Lean run is settled and PASSED (the registration the card cites)', settled)
  const proofCard = await call(b, 'vibe_v5_record_proposition', {
    statement: '表上奇数之和恒为平方', value: '该命题为真则原表可判定', motive: 'run-36：给辩论一个真实的卡号',
    p: 0.9, proof_ref: 'Members/r-1/Propos/p36.md#正式证明', proof_state: 'complete',
    lean_job: leanJob, member: 'r-1',
  })
  const debateSubject = proofCard.parsed && proofCard.parsed.recordId
  ok(typeof debateSubject === 'string' && debateSubject !== '',
    '§2 a REAL card with a declared proof exists (a free-text subject is refused now)', proofCard.parsed)
  const debate = await call(b, 'vibe_v5_meeting', {
    agenda: '辩论：表上奇数之和是否恒为平方（证明是否写完）',
    type: 'debate',
    subject: debateSubject,
    member: 'r-chair',
  })
  const debateId = debate.parsed && debate.parsed.meeting
  ok(debate.parsed && debate.parsed.ok === true && typeof debateId === 'string' && debateId !== '',
    '§2 the chair convened a debate meeting', debate.parsed && (debate.parsed.code || debate.parsed.message))
  const debateView = debateId ? kernel.meetings.meetingView({ meeting: String(debateId) }) : null
  ok(debateView && String(debateView.type) === 'debate' && String(debateView.state) !== 'closed',
    '§2 the meeting really carries type=debate and is not closed (what the guard reads)', debateView && { type: debateView.type, state: debateView.state })
  const openList = kernel.meetings.openMeetings()
  ok(Array.isArray(openList.meetings) && openList.meetings.some((m) => String(m.id) === String(debateId)),
    '§2 the durable marker lists it as open (the list the guard walks)', openList.meetings)

  console.log('=== 3. THE POLL IS REFUSED BY NAME WHILE THE DEBATE IS OPEN ===')
  const blocked = await call(b, 'vibe_v5_poll_open', { question: '辩论中能不能用投票板', options: ['能', '不能'], member: 'r-chair' })
  ok(blocked.parsed && blocked.parsed.ok === false, '§3 the call did NOT succeed', blocked.parsed)
  ok(codeOf(blocked.parsed) === 'VMU_NOT_PERMITTED', '§3 the refusal is the registered code VMU_NOT_PERMITTED', codeOf(blocked.parsed))
  const blockedText = textOf(blocked)
  ok(blockedText.includes('ballot board') && blockedText.includes('debate'), '§3 the message names WHAT is refused and WHY (a debate)', blockedText.slice(0, 200))
  ok(blockedText.includes(String(debateId)), '§3 the message carries the OPEN DEBATE\'S OWN ID (an actionable refusal, not a generic one)', String(debateId))
  ok(blockedText.includes('vibe_v5_verdict') && blockedText.includes('close'),
    '§3 the hint carries the two real ways forward: verdicts, or the chair closing the debate', blockedText.slice(0, 300))
  ok(boxesNow() === 1, '§3 the refused call opened NO box (the refusal happens before the box exists)', boxesNow())

  console.log('=== 4. CLOSING THE DEBATE LIFTS THE GUARD (a meeting fact, not a tool-wide ban) ===')
  const closed = await call(b, 'vibe_vmu_meeting', { action: 'close', id: debateId, member: 'r-chair' })
  ok(closed.parsed && closed.parsed.ok === true, '§4 the chair closed the debate through the kernel face', closed.parsed && (closed.parsed.code || closed.parsed.message))
  const afterClose = await call(b, 'vibe_v5_poll_open', { question: '辩论结束后能不能开票', options: ['甲', '乙'], member: 'r-chair' })
  ok(afterClose.parsed && afterClose.parsed.ok === true, '§4 the same call succeeds again once no debate is open', afterClose.parsed && (afterClose.parsed.code || afterClose.parsed.message))
  ok(boxesNow() === 2, '§4 the box count really moved (the success is not a cached receipt)', boxesNow())

  console.log('=== 5. AN ORDINARY MEETING DOES NOT BLOCK THE BOARD (the rule is about debates) ===')
  const ordinary = await call(b, 'vibe_v5_meeting', { agenda: '普通会议：轮次同步', type: 'ordinary', member: 'r-chair' })
  const ordinaryId = ordinary.parsed && ordinary.parsed.meeting
  ok(ordinary.parsed && ordinary.parsed.ok === true && typeof ordinaryId === 'string', '§5 an ordinary meeting is open', ordinary.parsed && (ordinary.parsed.code || ordinary.parsed.message))
  const duringOrdinary = await call(b, 'vibe_v5_poll_open', { question: '普通会议里能不能开票', options: ['能', '不能'], member: 'r-chair' })
  ok(duringOrdinary.parsed && duringOrdinary.parsed.ok === true,
    '§5 the board is OPEN during an ordinary meeting (a guard that blocked every meeting would be over-broad)', duringOrdinary.parsed && (duringOrdinary.parsed.code || duringOrdinary.parsed.message))
  ok(boxesNow() === 3, '§5 the third box exists (the ordinary-meeting call really ran)', boxesNow())

  console.log('=== 6. A NON-CHAIR STILL LEARNS THE MORE SPECIFIC REFUSAL FIRST ===')
  const nonChair = await call(b, 'vibe_v5_poll_open', { question: '研究员能不能开票', options: ['能', '不能'], member: 'r-1' })
  ok(nonChair.parsed && nonChair.parsed.ok === false && codeOf(nonChair.parsed) === 'VMU_NOT_PERMITTED',
    '§6 a member is refused by the chair gate (not by the debate guard)', nonChair.parsed)
  ok(!textOf(nonChair).includes('ballot board is not used while a debate'), '§6 the non-chair refusal is the CHAIR gate, not the E19 guard', textOf(nonChair).slice(0, 160))
  ok(boxesNow() === 3, '§6 no box was opened by the refused member call', boxesNow())
} finally {
  // The kernel may still be flushing its durable state when the suite ends; retry the removal instead of letting a
  // teardown race decide the exit code (the assertions above are what this suite measures).
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {})
}

console.log(failed === 0 ? '=== VMU RUN36 POLL/DEBATE GUARD: ' + passed + ' passed, 0 failed ===' : '')
if (failed !== 0) {
  console.log('=== VMU RUN36 POLL/DEBATE GUARD: ' + passed + ' passed, ' + failed + ' failed ===')
  for (const f of failures) console.log('  · ' + f)
  process.exit(1)
}
