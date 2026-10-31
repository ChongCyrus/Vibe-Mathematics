// tests/vmu-run167-feedback14-identity.test.mjs — RUN 167 (real machine, run 14 / FEEDBACK14): ONE NAME, ONE OBJECT.
//
// run 14 was the first run in which the office really drove four members as SEPARATE sessions — so it was the first run
// in which several kernel instances read the same durable ledger at the same time. Five defects came out of it, and they
// are one family: a name that resolved to two objects, or a reading that was honest about itself but not about its scope.
//   · F3 a MINTED meeting id took a name the ARCHIVE still held (`m33` open while `m33` was archived: the read faces
//     answered with the previous run's closure minutes and no receipt said which object answered);
//   · F4 a paper started after the office pruned the paper track minted a name the TRASH still held (`paper-p1`), so the
//     id the office printed denoted the old, restorable paper in a member's world;
//   · F6 `advance` assigned cross-reviews by rotating the PARTICIPANT list, so a member with no part was somebody's
//     review target and a member with nothing to review was counted as a REFUSER — the paper went back to writing, the
//     round bumped, the review that HAD been filed was invalidated, and three rounds were spent on a reason that was
//     never about the mathematics;
//   · F9 the closure-vote reading called this session's blind spot `missing`, which read as "these members did not vote"
//     (the office saw 3/3, a member saw 1/3 about the SAME votes);
//   · F6 follow-up (found while re-checking F6): under the default content-only fingerprint two papers reviewed in the
//     same round by the same member with the same verdict produced an IDENTICAL review body, so the second paper's review
//     row was deduplicated into the first paper's row — its own cross-review gate then counted zero reviewers;
//   · F5 the round receipt only said `narrowed:false` when the narrowing had been DECLARED but could not be installed,
//     so "no narrowing declared" and "narrowing failed" printed the same top-level word.
//
// RULE E: every collection assertion states its non-emptiness (or exact shape) in the same expression.
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

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
const CODE = (r) => (r && r.code) || null

const entry = await import(pathToFileURL(ENTRY).href)
const BASE = 'D:/_tmp/r167/identity'
await mkdir(BASE, { recursive: true })

const boot = async (root, settings = null) => {
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async (spec) => { specs.push(spec); return () => {} } } }
  const handle = entry.apply(ctx, Object.assign({ root, packs: ['v5r'], clock: () => 1000 }, settings ? { settings } : {}))
  await handle.ready()
  const specOf = (name) => specs.filter((s) => s.name === name)[0]
  const call = async (name, args) => JSON.parse(await specOf(name).execute(args, {}))
  return { handle, kernel: handle.kernel, call }
}
const STAFF = [['r-acad', 'chair'], ['r-1', 'member'], ['r-2', 'member']]
const staff = async (k) => { for (const [id, slot] of STAFF) await k.members.hire({ id, slot }) }
const roots = []
const newRoot = async (tag) => { const r = await mkdtemp(join(BASE, tag + '-')); roots.push(r); return r }

// ── §0 source pins ──────────────────────────────────────────────────────────────────────────────────────────────────
{
  const meetings = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'meetings.js'), 'utf8')
  const paper = readFileSync(join(REPO, 'vibe-math-vmu', 'kit', 'paper.js'), 'utf8')
  const turn = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js'), 'utf8')
  const tools = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')
  ok(/const archivedIds = new Set\(archive\.map\(\(x\) => String\(x\.id\)\)\)/.test(meetings) && /while \(takenAny\(mid\)/.test(meetings),
    '§0 F3: the mint path steps past ARCHIVED ids (takenAny), not only live ones')
  ok(/const trashedNamesake = /.test(paper) && /records\.trashRows\(\{ track: TRACK \}\)/.test(paper),
    '§0 F4: the paper side reads the durable trash before minting or deriving a name')
  ok(paper.split('function reviewRowOf(state, member) {').length - 1 === 1, '§0 F6: reviewRowOf is declared ONCE (it was two copies)')
  ok(/function reviewTargetFor\(state, member\)/.test(paper) && /const required = state\.participants\.filter\(\(id\) => assignedOther\(id\)\)/.test(paper),
    '§0 F6: the assignment names an AUTHOR, and only members with a cross target owe a verdict')
  ok(/`missing` means "not seen in THIS session", NOT "did not vote"/.test(turn),
    '§0 F9: the closure reading names its blind spot inside the field that explains the window (the small face has a size pin)')
  ok(/const review = \{ target: str\(state\.target\), member:/.test(paper) && /const part = \{\s*\n\s*target: str\(state\.target\)/.test(paper),
    '§0 F6 follow-up: a paper row NAMES its paper (content-only fingerprints exclude the title, so the paper id must be in the body)')
  ok(/function narrowInEffectMeans\(face, notNarrowed, inEffect\)/.test(tools) && /narrowing\.reason !== 'type-declares-no-narrowing'/.test(tools) && /const narrowingInEffect = face\.narrowed === true && notNarrowed\.length === 0/.test(tools),
    '§0 F5: the round receipt classifies the rows by their own reason, and reports DECLARED-AND-INSTALLED (the effect), not merely declared')
}

// ── §1 ★★ F3: a minted meeting id never takes a name the ARCHIVE holds ──────────────────────────────────────────────
{
  const root = await newRoot('archive')
  const A = await boot(root)
  await staff(A.kernel)
  const first = await A.call('vibe_v5_meeting', { action: 'convene', member: 'r-acad', agenda: 'run 167 §1 first meeting', type: 'ordinary', members: ['r-1', 'r-2'] })
  const firstId = first.meeting
  ok(first.ok === true && firstId === 'm1', '§1 fixture: the first meeting is minted m1', { id: firstId, ok: first.ok })
  const closed = await A.call('vibe_vmu_meeting', { action: 'close', id: firstId, member: 'r-acad' })
  ok(closed.ok === true, '§1 fixture: m1 is closed (it moves to the ARCHIVE)', { ok: closed.ok, code: CODE(closed) })
  const archivedA = A.kernel.meetings.archivedIds()
  ok(Array.isArray(archivedA) && archivedA.includes('m1'), '§1 fixture: the archive holds m1', archivedA)

  // a FRESH kernel over the same workspace: its open-counter is 0, so a mint starts at m1 — the name the archive holds
  const B = await boot(root)
  ok(B.kernel.meetings.archivedIds().includes('m1'), '§1 B (fresh process) still sees m1 in the archive', B.kernel.meetings.archivedIds())
  const second = await B.call('vibe_v5_meeting', { action: 'convene', member: 'r-acad', agenda: 'run 167 §1 second meeting', type: 'ordinary', members: ['r-1'] })
  ok(second.ok === true && second.meeting !== 'm1',
    '★★ §1 F3 FIXED: the minted id STEPS PAST the archived name (one name, one meeting)', { minted: second.meeting, ok: second.ok })
  const sum = await B.call('vibe_vmu_meeting', { action: 'summary', id: second.meeting })
  ok(sum.ok === true && sum.state === 'open', '§1 the new meeting reads as OPEN under its own name', { ok: sum.ok, state: sum.state })
  const sumOld = await B.call('vibe_vmu_meeting', { action: 'summary', id: 'm1' })
  ok(sumOld.ok === true && sumOld.state === 'closed' && sumOld.state !== sum.state,
    '§1 and m1 still reads as the CLOSED one (the two objects stayed distinguishable by state)', { state: sumOld.state, newState: sum.state })
  await rm(root, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
}

// ── §2 ★★ F4: a trashed paper still holds its name ─────────────────────────────────────────────────────────────────
{
  const root = await newRoot('papernames')
  const A = await boot(root)
  await staff(A.kernel)
  const started = (await A.call('vibe_v5_paper', { action: 'start', target: 'q1', title: 'run 167 §2 first paper', member: 'r-acad', participants: ['r-1', 'r-2'] })).started
  ok(started.ok === true && started.target === 'q1' && started.id === 'paper-q1',
    '§2 fixture: a portable target q1 starts the paper paper-q1', { ok: started.ok, code: CODE(started), id: started.id })
  const pr = await A.call('vibe_vmu_records', { action: 'prune', track: 'paper', keep: 0, why: 'run 167 §2: put the paper in the trash' })
  ok(pr.ok === true && pr.prunedCount > 0, '§2 fixture: the paper track is pruned into the TRASH', { prunedCount: pr.prunedCount, ok: pr.ok })
  const again = await A.call('vibe_v5_paper', { action: 'start', target: 'q1', title: 'run 167 §2 same name', member: 'r-acad', participants: ['r-1', 'r-2'] })
  ok(again.ok === false && /PAPER_STATE/.test(String(CODE(again))),
    '★★ §2 F4 FIXED: starting a paper under a name the TRASH still holds is REFUSED BY NAME', { code: CODE(again) })
  ok(/TRASH/.test(String(again.message || '')) && /restorable/.test(String(again.message || '')),
    '§2 and the refusal says the name is held by the trash, not that the ledger is "busy"', String(again.message || '').slice(0, 140))
  const other = (await A.call('vibe_v5_paper', { action: 'start', target: 'q2', title: 'run 167 §2 other name', member: 'r-acad', participants: ['r-1', 'r-2'] })).started
  ok(other.ok === true && other.id === 'paper-q2', '§2 a different target still starts (the refusal is about the name, not the flow)', { ok: other.ok, id: other.id })

  // the MINTED path has the same rule: the trash reserves `paper-p1`
  const root2 = await newRoot('papernames2')
  const C = await boot(root2)
  await staff(C.kernel)
  const m1 = (await C.call('vibe_v5_paper', { action: 'start', target: '前 n 个 偶数 之和', title: 'run 167 §2 标题', member: 'r-acad', participants: ['r-1', 'r-2'] })).started
  ok(m1.ok === true && m1.id === 'paper-p1', '§2 fixture: a non-portable target mints paper-p1', { id: m1.id, ok: m1.ok })
  const pr2 = await C.call('vibe_vmu_records', { action: 'prune', track: 'paper', keep: 0, why: 'run 167 §2 minted' })
  ok(pr2.ok === true && pr2.prunedCount > 0, '§2 fixture: pruned again', { prunedCount: pr2.prunedCount })
  const m2 = (await C.call('vibe_v5_paper', { action: 'start', target: '另一个 不可 移植 的 目标', title: 'run 167 §2 标题二', member: 'r-acad', participants: ['r-1', 'r-2'] })).started
  ok(m2.ok === true && m2.id !== 'paper-p1',
    '★★ §2 F4 FIXED: the mint skips the name the trash holds (paper-p1 is reserved, the new paper is not it)', { id: m2.id, ok: m2.ok })
  await rm(root, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await rm(root2, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
}

// ── §3 ★★ F6: cross-review targets are AUTHORS, and a member with nothing to review is exempt ───────────────────────
{
  const root = await newRoot('crossreview')
  const A = await boot(root)
  await staff(A.kernel)
  const started = (await A.call('vibe_v5_paper', { action: 'start', target: 'q6', title: 'run 167 §3 paper', member: 'r-acad', participants: ['r-acad', 'r-1', 'r-2'] })).started
  ok(started.ok === true, '§3 fixture: a three-participant paper starts', { ok: started.ok, code: CODE(started) })
  const part = (await A.call('vibe_v5_paper', { action: 'part', target: 'q6', member: 'r-1', title: '§3 唯一的小节', solution: '只有 r-1 写了内容', methods: 'm', rules: 'r', limits: 'l' })).part
  ok(part.ok === true, '§3 fixture: only r-1 records a part', { ok: part.ok, code: CODE(part) })
  const adv = (await A.call('vibe_v5_paper', { action: 'advance', target: 'q6' })).advance
  ok(adv.ok === true && adv.to === 'reviewing', '§3 advance moves writing → reviewing', { to: adv.to, ok: adv.ok })
  const rot = adv.reviewOf || {}
  ok(rot['r-acad'] === 'r-1' && rot['r-2'] === 'r-1',
    '★★ §3 F6 FIXED: every assigned reviewer points at the member WHO WROTE THE PART', rot)
  ok(rot['r-1'] === undefined, '§3 and the author is assigned NOBODY (a member cannot review their own section)', { r1: rot['r-1'] })
  ok(Array.isArray(adv.notRequired) && adv.notRequired.length === 1 && adv.notRequired[0] === 'r-1',
    '§3 the author is reported as EXEMPT from the unanimity check (not silently required)', adv.notRequired)
  ok(typeof adv.notRequiredMeans === 'string' && /EXEMPT/.test(adv.notRequiredMeans), '§3 and the receipt says what exempt means', adv.notRequiredMeans)

  const rv1 = await A.call('vibe_v5_paper', { action: 'review', target: 'q6', member: 'r-acad', deliverable: true, comments: '§3 通过' })
  const rv2 = await A.call('vibe_v5_paper', { action: 'review', target: 'q6', member: 'r-2', deliverable: true, comments: '§3 通过' })
  ok(rv1.ok === true && rv2.ok === true, '§3 both non-authors file a deliverable review', { a: rv1.ok, b: rv2.ok })
  ok(rv1.review && rv1.review.of === 'r-1' && rv2.review && rv2.review.of === 'r-1',
    '§3 the reviews are ABOUT the part that exists', { of1: rv1.review && rv1.review.of, of2: rv2.review && rv2.review.of })
  const adv2 = (await A.call('vibe_v5_paper', { action: 'advance', target: 'q6' })).advance
  ok(adv2.ok === true && adv2.to === 'awaiting-editor' && adv2.round === 1,
    '★★ §3 F6 FIXED: the paper reaches awaiting-editor in the FIRST round (no refuser was invented, no round was burned)', { to: adv2.to, round: adv2.round, ok: adv2.ok })
  ok(Array.isArray(adv2.notRequired) && adv2.notRequired.includes('r-1'),
    '§3 and the exempt author is STILL reported, never silently dropped', adv2.notRequired)
  await rm(root, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
}

// ── §4 ★★ F9: the closure reading says it is THIS SESSION's window ──────────────────────────────────────────────────
{
  const root = await newRoot('closure')
  const A = await boot(root)
  await staff(A.kernel)
  const before = A.kernel.closureVoteView()
  ok(Array.isArray(before.missing) && before.missing.length > 0,
    '§4 fixture: nobody has voted in this session, so the blind spot is non-empty', before.missing)
  ok(before.window === 'session' && /SESSION/.test(before.windowMeans),
    '★★ §4 F9 FIXED: the reading names the window it really has (this session, not "the institute")', { window: before.window })
  ok(/`missing` means "not seen in THIS session", NOT "did not vote"/.test(before.windowMeans),
    '§4 and the field that explains the window also explains `missing` — the sentence that was being misread', before.windowMeans)
  ok(/votes cast in another session are invisible here/.test(before.windowMeans),
    '§4 and says the institute-wide count is NOT known here', before.windowMeans)
  await A.call('vibe_vmu_vote', { member: 'r-1', solved: true, why: 'run 167 §4' })
  const after = A.kernel.closureVoteView()
  ok(after.votesCast === 1 && !after.missing.includes('r-1'),
    '§4 a vote CAST IN THIS SESSION leaves the blind spot (the window is honest both ways)', { votesCast: after.votesCast, missing: after.missing })
  await rm(root, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
}

// ── §5 ★★ F5: the round receipt states whether the narrowing took EFFECT ────────────────────────────────────────────
{
  const { V5R_PACK_TOOLS } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')).href)
  const roundSpec = V5R_PACK_TOOLS.filter((t) => t && t.name === 'vibe_v5_meeting_round')[0]
  const stub = (type, rows, turnStep) => ({
    members: { roster: () => ([{ id: 'r-acad', state: 'live' }, { id: 'r-1', state: 'live' }]) },
    meetings: { meetingView: () => ({ type, chair: 'r-acad' }) },
    toolsView: () => ({ tools: rows }),
    setMemberToolOverride() {},
    clearMemberToolOverride() {},
    turn: { step: turnStep || (async () => ({ ok: true })) },
  })
  // (a) a type that declares NO narrowing: the round is not narrowed BY DECLARATION (not by failure)
  const plain = await roundSpec.handler({ meeting: 'm1' }, { kernel: stub('ordinary', [{ name: 'vibe_v5_say' }]) })
  ok(plain.ok === true && plain.narrowingInEffect === false && /declares NO narrowing/.test(String(plain.narrowingInEffectMeans || '')),
    '★★ §5 F5: a type that declares no narrowing says exactly that (not "it failed")', plain.narrowingInEffectMeans)
  // (b) a type that DECLARES an allow list but the identity face yielded none of it: "not narrowed" names the real reason
  const empty = await roundSpec.handler({ meeting: 'm1' }, { kernel: stub('debate', []) })
  ok(empty.ok === true && empty.narrowingInEffect === false,
    '§5 a declared-but-not-installable narrowing reports narrowingInEffect:false at the TOP level', { ok: empty.ok, inEffect: empty.narrowingInEffect })
  ok(/DECLARES an allow list/.test(String(empty.narrowingInEffectMeans || '')) && /empty-intersect/.test(String(empty.narrowingInEffectMeans || '')),
    '★★ §5 F5 FIXED: and the sentence names the real cause (empty-intersect) instead of reusing the "nothing declared" wording', empty.narrowingInEffectMeans)
  ok(/identity face showed 0 of the 20 allowed name/.test(String(empty.narrowingInEffectMeans || '')),
    '§5 with the actual counts (the reader does not have to parse narrowing.members[])', empty.narrowingInEffectMeans)
  // (c) when the allow list DOES install, the same field says so
  const narrowRows = ['vibe_v5_say', 'vibe_v5_motion', 'vibe_v5_verdict', 'vibe_v5_record_proposition', 'vibe_v5_read_library', 'vibe_v5_inbox', 'vibe_v5_verdict_final', 'vibe_v5_message', 'vibe_v5_wait', 'vibe_v5_second', 'vibe_v5_meeting', 'vibe_v5_record_progress', 'vibe_v5_tool_help', 'vibe_vmu_meeting', 'vibe_vmu_chat', 'vibe_vmu_turn', 'vibe_vmu_mailbox', 'vibe_vmu_records', 'vibe_vmu_status', 'vibe_vmu_tools'].map((name) => ({ name }))
  const installed = await roundSpec.handler({ meeting: 'm1' }, { kernel: stub('debate', narrowRows) })
  ok(installed.ok === true && installed.narrowingInEffect === true && /in effect/.test(String(installed.narrowingInEffectMeans || '')),
    '§5 a narrowing that DID install reads differently again (one field, three facts)', installed.narrowingInEffectMeans)
  // (d) the failed-step door carries the same field (one receipt shape, both doors)
  const failedStep = await roundSpec.handler({ meeting: 'm1' }, { kernel: stub('ordinary', [], async () => ({ ok: false, code: 'VMU_STATE', message: 'no turn' })) })
  ok(failedStep.ok === false && failedStep.turnFailed === true && failedStep.narrowingInEffect === false && typeof failedStep.narrowingInEffectMeans === 'string',
    '§5 the failed-step path carries the same field (one receipt shape, both doors)', { ok: failedStep.ok, inEffect: failedStep.narrowingInEffect })
}

// ── §6 ★★ F6 follow-up found while re-checking: two papers' review rows are TWO rows ─────────────────────────────────
// The default fingerprint policy is `content-only` (kind+body+tags; the title is NOT part of the fingerprint BY DESIGN).
// The review body used to carry member/of/round/deliverable/comments but NOT the paper it reviews, so when two papers were
// reviewed in the same round by the same member with the same verdict, the second paper's review row was DEDUPLICATED into
// the first paper's row: the second paper had a review "on record" that its own title lookup could not find, its
// cross-review gate counted zero reviewers, and `advance` refused a paper that had in fact been reviewed.
{
  const root = await newRoot('cross-paper-rows')
  const A = await boot(root)
  await staff(A.kernel)
  const mkPaper = async (target, title) => {
    const started = (await A.call('vibe_v5_paper', { action: 'start', target, title, member: 'r-acad', participants: ['r-acad', 'r-1'] })).started
    ok(started.ok === true, '§6 fixture: paper ' + target + ' starts', { ok: started.ok, code: CODE(started) })
    await A.call('vibe_v5_paper', { action: 'part', target, member: 'r-acad', title: '同一个标题', solution: '同一个解法', methods: 'm', rules: 'r', limits: 'l' })
    const adv = (await A.call('vibe_v5_paper', { action: 'advance', target })).advance
    ok(adv.ok === true && adv.to === 'reviewing', '§6 fixture: paper ' + target + ' is in cross-review', { to: adv.to })
  }
  await mkPaper('q7', '第一篇')
  await mkPaper('q8', '第二篇')
  // the SAME reviewer, the SAME verdict text, the SAME round: byte-identical bodies except for the paper they name
  const r7 = (await A.call('vibe_v5_paper', { action: 'review', target: 'q7', member: 'r-1', deliverable: true, comments: '同样的评语' })).review
  const r8 = (await A.call('vibe_v5_paper', { action: 'review', target: 'q8', member: 'r-1', deliverable: true, comments: '同样的评语' })).review
  ok(r7 && r7.ok === true && r8 && r8.ok === true, '§6 both reviews are accepted on their own paper', { a: r7 && r7.ok, b: r8 && r8.ok })
  const rows = (() => { try { const got = A.kernel.records.list({ track: 'paper', limit: 200 }); return Array.isArray(got.items) ? got.items : [] } catch { return [] } })()
  const reviewRows = rows.filter((r) => /review\|r-1$/.test(String(r.title || '')))
  ok(reviewRows.length === 2, '★★ §6 FIXED: two papers produce TWO review rows (one row cannot answer for two papers)', reviewRows.map((r) => r.title))
  const targets = reviewRows.map((r) => { try { const g = A.kernel.records.get({ id: r.id }); const full = g && g.record ? g.record : g; return String(JSON.parse(String((full && full.body) || '{}')).target || '') } catch { return '' } }).sort()
  ok(targets[0] === 'q7' && targets[1] === 'q8', '★ §6 each review row NAMES the paper it reviews (that is why the bodies differ)', targets)
  const a7 = (await A.call('vibe_v5_paper', { action: 'advance', target: 'q7' })).advance
  const a8 = (await A.call('vibe_v5_paper', { action: 'advance', target: 'q8' })).advance
  ok(a7.ok === true && a7.to === 'awaiting-editor', '§6 paper q7 passes its cross-review gate', { to: a7.to, code: CODE(a7) })
  ok(a8.ok === true && a8.to === 'awaiting-editor', '★★ §6 FIXED: paper q8 passes its OWN gate (its review was not swallowed by q7)', { to: a8.to, code: CODE(a8) })
  await rm(root, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
}

for (const r of roots) await rm(r, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + ' ' + passed + ' passed / ' + failed + ' failed')
if (failed > 0) { console.error(failures.join('\n')); process.exit(1) }
