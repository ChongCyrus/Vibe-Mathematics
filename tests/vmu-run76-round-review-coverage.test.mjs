// tests/vmu-run76-round-review-coverage.test.mjs — TB-2713 (task-196 / RUN 76): A ROUND THAT INVALIDATED LAST
// ROUND'S VERDICTS MUST SAY SO ON THE RECEIPT.
//
// THE DEFECT THIS PINS (measured on the 76th live run, build 3fed0ba8): `paper advance` bounced the paper from round 2
// to round 3, and the same review rows that said `deliverable:true` a moment earlier were then read as
// `stale:["r-acad"]` — the receipt also carried `stale` and `notYetReviewed` but NOTHING said that a round boundary had
// invalidated those verdicts, WHICH rows they were, or that the members must file again. Two of three `advance` calls
// bounced, r-1's FEEDBACK `rec-33` complained about it, and `final` was refused once by VMU_OFFICE_CONSULT_REQUIRED
// because the paper had burned rounds on a rule nobody had explained.
//
// THE MECHANISM IS DELIBERATE AND IS NOT CHANGED HERE: a review judges the prose of ITS round, so when the round moves
// a row from round N−1 is durable history, not a vote on round N (`vibe-math-vmu/kit/paper.js` `readReview`'s
// `source:'durable-other-round'` branch and `requireCrossReview`, which count `body.round === state.round` only). What
// was missing was the READING. This suite pins that reading:
//   · §0 the shape: ONE arithmetic function (`perRoundReviewCoverageOfState`) is defined once in the kit, `missing`
//        and `invalidatedByRound` are filled from the rows (not forced empty), the advance/status doors do not each own
//        a copy, and the invalidation mechanism itself is still there;
//   · §1 a real 3-seat paper: round 2's three verdicts are invalidated by the round-3 bounce — the SAME advance
//        receipt then carries `perRoundReviewCoverage` with `missing` = the three expected members and
//        `invalidatedByRound` = the three round-2 rows, each with the recordId the review receipt printed;
//   · §2 after the three members file again for round 3 the same reading flips to `covered` = the three round-3 rows
//        and `missing: []`;
//   · §3 the advance door and the status door print the SAME object, byte for byte (`covered` included) — if either
//        face ever grows its own arithmetic this goes red;
//   · §4 the fields are readings, not a second gate: the bounce still happened and `final` is not touched here.
//
// RULE E: every list assertion declares NON-EMPTY first, and every reading is READ BACK from a serialized receipt.
// Run: node tests/vmu-run76-round-review-coverage.test.mjs   Last line: === RUN-76 ROUND REVIEW COVERAGE: N passed, M failed ===
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

import { tmpRoot as __tmpRoot } from './_lib/scratch.mjs'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const TOOLS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
const KIT_PAPER = join(REPO, 'vibe-math-vmu', 'kit', 'paper.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
// RULE E shape B: an empty actual and an empty expected must not compare equal, and `undefined` must serialise to a
// value — otherwise `eq(undefined, [])` is a vacuous pass.
const serialize = (v) => JSON.stringify(v === undefined ? '\u0000undefined' : v)
const eq = (actual, expected, label) => ok(serialize(actual) === serialize(expected), label, { actual, expected })
const has = (src, needle, label) => ok(String(src).includes(needle), label, needle)

const TOOLS_SRC = await readFile(TOOLS, 'utf8')
const KIT_SRC = await readFile(KIT_PAPER, 'utf8')

const boot = async (config = {}) => {
  const state = { specs: [], effects: [] }
  const ctx = {
    effect(fn, label) { state.effects.push(label); return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const entry = await import(pathToFileURL(ENTRY).href)
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, state, names: state.specs.map((s) => s.name), specOf: (n) => state.specs.find((s) => s.name === n) }
}
const receipt = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  ok(!!spec, '前置(RULE E)：工具面注册了 ' + name)
  if (!spec) return { parsed: undefined, missing: true }
  const raw = await spec.execute(args, {})
  return { raw, parsed: typeof raw === 'string' ? JSON.parse(raw) : raw }
}
const log = (o) => (o === undefined ? '<undefined>' : JSON.stringify(o))

// ── §0. THE SHAPE: ONE ARITHMETIC, AND THE INVALIDATION RULE IS STILL THE KIT'S ────────────────────────────────
console.log('=== 0. 形状：唯一算术 `perRoundReviewCoverageOfState` + 机制未被改掉 ===')
const coverageBody = (() => {
  const at = KIT_SRC.indexOf('function perRoundReviewCoverageOfState(')
  if (at < 0) return ''
  const after = KIT_SRC.indexOf('function requireCrossReview(', at)
  return after < 0 ? KIT_SRC.slice(at) : KIT_SRC.slice(at, after)
})()
has(KIT_SRC, 'function perRoundReviewCoverageOfState(state) {',
  '★★★ 正：kit 里有唯一算术函数 `perRoundReviewCoverageOfState(state)`')
eq(KIT_SRC.split('function perRoundReviewCoverageOfState(').length - 1, 1,
  '★★★ 正：这个函数定义恰好一处（不是两处各算一遍）')
ok(coverageBody.includes('const missing = []') && coverageBody.includes('missing.push(member)'),
  '★★★ 正：`missing` 是逐成员判出来的（先建空表再 push），不是恒空字面量', coverageBody.length)
ok(!coverageBody.includes('missing: []'),
  '★★★ 反：函数里没有「missing 恒空」的捷径')
// TB-2761 (RUN 81 D-1/D-2) rewrote the arithmetic: the gate binds the judged part's FINGERPRINT (not the round number),
// and the two old lists are now FILTERED VIEWS of one counted `voidReviews`. These pins name the new single source.
has(KIT_SRC, 'const coverageVerdictOf = (state, body) => {',
  '★★★ 正：覆盖判定收在一处（coverageVerdictOf），requireCrossReview 与读数共用它')
has(KIT_SRC, "if (judged.partChanged) return out(false, 'part-text-changed')",
  '★★★ 正（TB-2761 D-1）：判据是「被审节 fingerprint 是否变」，不是「round 是否等于论文 round」')
has(KIT_SRC, 'if (body.deliverable !== true) return out(false, null)',
  '★★★ 正：只有 deliverable:true 的票才可能计入 covered（判否的票仍是 missing，不是作废）')
has(KIT_SRC, "(member !== '' && of === member)",
  '★★★ 正：自审永不计入 covered（of 必须点名别人）')
has(coverageBody, 'const byWhy = new Map()',
  '★★★ 正（TB-2761 D-2）：voidReviews 按 why 分组（Map），不是两个各自为政的名单')
has(coverageBody, 'count: byWhy.get(why).length',
  '★★★ 正：每个 why 组带 count（「没有作废」与「作废两张」不再读起来一样）')
has(KIT_SRC, "source: 'durable-other-round'",
  '★★★ 机制 pin：readReview 的 durable-other-round 分支还在（上轮票作废是刻意的安全设计）')
eq(KIT_SRC.split('state.round += 1').length - 1, 2,
  '★★★ 机制 pin：round 只在两处递增（advance 的 disagreement 分支、final revise 重开写作）')
has(TOOLS_SRC, 'perRoundReviewCoverage: exists && typeof paper.perRoundReviewCoverage === \'function\' ? paper.perRoundReviewCoverage(target) : null,',
  '★★★ 正：status 门只是透传 `paper.perRoundReviewCoverage(target)`（同一对象，不另算）')
ok(!TOOLS_SRC.includes('invalidatedByRound'),
  '★★★ 反：工具面没有第二份算术（`invalidatedByRound` 这个名字只在 kit 里出现）')
has(KIT_SRC, 'function crossReviewCoverage(state) {',
  '★★ 正：RUN 203 的 crossReview 覆盖读数仍在（本字段是另一个问题，不是替换）')

// ── §1. A REAL 3-SEAT PAPER: ROUND 2'S THREE VERDICTS ARE INVALIDATED BY THE ROUND-3 BOUNCE ───────────────────
console.log('=== 1. 真实 3 席论文：round 2 三票全投，round 3 bounce 后回执点名三张作废票 ===')
const base = await mkdtemp(join(__tmpRoot(), 'vmu-run76-coverage-'))
const prevCwd = process.cwd()
process.chdir(base)
const v5r = await boot({ root: join(base, 'v5r'), packs: ['v5r'] })
const kernel = v5r.handle.kernel
const ACAD = 'acad'
const R1 = 'r-1'
const R2 = 'r-2'
await kernel.members.hire({ id: ACAD, slot: 'chair' })
await kernel.members.hire({ id: R1, slot: 'member' })
await kernel.members.hire({ id: R2, slot: 'member' })
const T = 'cov-p'
const started = (await receipt(v5r, 'vibe_v5_paper', { action: 'start', target: T, participants: [ACAD, R1, R2], format: 'md' })).parsed
ok(!!started && started.ok === true && started.started && started.started.status === 'writing',
  '前置(RULE E)：三席论文建成、进入 writing', started && started.started && started.started.status)
for (const [member, title] of [[ACAD, '§1 引言'], [R1, '§2 方法'], [R2, '§3 结论']]) {
  const wrote = (await receipt(v5r, 'vibe_v5_paper', { action: 'part', target: T, member, part: title, body: title + ' 的正文。' })).parsed
  ok(!!wrote && wrote.ok === true, '前置(RULE E)：' + member + ' 写了 ' + title, wrote && wrote.part)
}
const r1Open = (await receipt(v5r, 'vibe_v5_paper', { action: 'advance', target: T })).parsed
ok(!!r1Open && r1Open.ok === true && r1Open.advance && r1Open.advance.from === 'writing' && r1Open.advance.to === 'reviewing' && Number(r1Open.advance.round) === 1,
  '前置(RULE E)：writing → reviewing（round 1）', r1Open && r1Open.advance)
// round 1：只投一票（判否），让 advance 走 disagreement 分支 —— 这正是 round 1 → 2 的现场。
const v1 = (await receipt(v5r, 'vibe_v5_paper', { action: 'review', target: T, member: R2, deliverable: false, notes: 'round 1 需要改' })).parsed
ok(!!v1 && v1.ok === true && typeof (v1.review && v1.review.recordId) === 'string' && v1.review.recordId.length > 0,
  '前置(RULE E)：round 1 的评审行真的写成了（recordId 可从 review 回执读）', v1 && v1.review)
const r2Open = (await receipt(v5r, 'vibe_v5_paper', { action: 'advance', target: T })).parsed
eq(r2Open && r2Open.advance && r2Open.advance.from, 'reviewing', '前置(RULE E)：round 1 reviewing → writing')
eq(r2Open && r2Open.advance && r2Open.advance.to, 'writing', '前置(RULE E)：round 1 因分歧回到 writing')
eq(r2Open && r2Open.advance && Number(r2Open.advance.round), 2, '前置(RULE E)：round 1 → round 2（一次 bounce）')
const covR2 = r2Open && r2Open.advance && r2Open.advance.perRoundReviewCoverage
ok(!!covR2 && Array.isArray(covR2.voidReviews) && covR2.voidReviews.length === 0 && Array.isArray(covR2.invalidatedByRound) && covR2.invalidatedByRound.length === 0,
  '★★ 正（TB-2761）：round 1 那张票判的是 FALSE ⇒ 它是 missing，不是被作废（voidReviews 为空，空是显式的）', covR2 && { voidReviews: covR2.voidReviews, invalidated: covR2.invalidatedByRound })
const open2 = (await receipt(v5r, 'vibe_v5_paper', { action: 'advance', target: T })).parsed
eq(open2 && open2.advance && open2.advance.from, 'writing', '前置(RULE E)：round 2 writing → reviewing')
eq(open2 && open2.advance && open2.advance.to, 'reviewing', '前置(RULE E)：round 2 进入 reviewing')
eq(open2 && open2.advance && Number(open2.advance.round), 2, '前置(RULE E)：开 round 2 的评审不动 round 号')
const covOpen2 = open2 && open2.advance && open2.advance.perRoundReviewCoverage
ok(!!covOpen2 && Array.isArray(covOpen2.expected) && covOpen2.expected.length === 3,
  '★★ 正：round 2 开始时期望集合是三名成员（与 requireCrossReview 同一 tiers 规则）', covOpen2 && covOpen2)
ok(!!covOpen2 && covOpen2.covered.length === 0 && covOpen2.missing.length === 3,
  '★★ 正：round 2 刚开始时没人有本轮票：covered=[]、missing=3 席', covOpen2 && { covered: covOpen2.covered, missing: covOpen2.missing })
// round 2：三票全投（两真一假）——「全员投」的现场，但有一票拒收，所以 advance 仍走分歧并抬 round。
const v2A = (await receipt(v5r, 'vibe_v5_paper', { action: 'review', target: T, member: ACAD, deliverable: true, notes: 'round 2 可交付' })).parsed
const v2B = (await receipt(v5r, 'vibe_v5_paper', { action: 'review', target: T, member: R1, deliverable: true, notes: 'round 2 可交付' })).parsed
const v2C = (await receipt(v5r, 'vibe_v5_paper', { action: 'review', target: T, member: R2, deliverable: false, notes: 'round 2 还要改' })).parsed
ok([v2A, v2B, v2C].every((v) => v && v.ok === true && typeof (v.review && v.review.recordId) === 'string'),
  '前置(RULE E)：round 2 三票都真的写成了（三个 recordId 都在 review 回执里）',
  [v2A, v2B, v2C].map((v) => v && v.review && v.review.recordId))
const byMember = new Map([[ACAD, v2A.review.recordId], [R1, v2B.review.recordId], [R2, v2C.review.recordId]])
const r3 = (await receipt(v5r, 'vibe_v5_paper', { action: 'advance', target: T })).parsed
const adv3 = r3 && r3.advance
ok(!!adv3 && adv3.ok === true, '前置(RULE E)：round 2 的 advance 成功返回（不是拒绝）', adv3 && (adv3.code || adv3.note))
eq(adv3 && adv3.from, 'reviewing', '★★ 正：round 2 的 advance 从 reviewing 出发')
eq(adv3 && adv3.to, 'writing', '★★ 正：round 2 因分歧回到 writing（bounce 真实发生）')
eq(adv3 && Number(adv3.round), 3, '★★ 正：round 2 → round 3')
ok(!!adv3 && Object.prototype.hasOwnProperty.call(adv3, 'perRoundReviewCoverage'),
  '★★★ 正：bounce 回执本身带 `perRoundReviewCoverage`（RUN 76 缺的就是这个键）', adv3 && Object.keys(adv3).includes('perRoundReviewCoverage'))
const cov3 = adv3 && adv3.perRoundReviewCoverage
ok(!!cov3 && Number(cov3.round) === 3,
  '★★★ 正：读数说的是 paper 当前 round（3），不是刚关掉的那一轮', cov3 && cov3.round)
ok(!!cov3 && Array.isArray(cov3.expected) && cov3.expected.length === 3 && cov3.missing.length === 1 && cov3.missing[0] === R2,
  '★★★ 正（TB-2761 D-1）：round 3 的 missing 只剩真正拒收的 R2 —— 两张 round-2 的 deliverable 票判的正文没变，仍然计入', cov3 && { expected: cov3.expected, missing: cov3.missing })
ok(!!cov3 && Array.isArray(cov3.covered) && cov3.covered.length === 2 && JSON.stringify(cov3.covered.map((x) => x.member).sort()) === JSON.stringify([ACAD, R1].sort()),
  '★★★ 正：covered 是两张「跨轮但正文未变」的票（round bump 不再作废未改节的票）', cov3 && cov3.covered)
ok(!!cov3 && cov3.covered.every((x) => x.recordId === byMember.get(x.member) && Number(x.round) === 3),
  '★★★ 正：covered 的 recordId 等于该成员 round-2 评审回执的 recordId（换轮不换行），round 报的是 paper 当前轮 3',
  cov3 && cov3.covered.map((x) => ({ member: x.member, got: x.recordId, want: byMember.get(x.member) })))
ok(!!cov3 && Array.isArray(cov3.invalidatedByRound) && cov3.invalidatedByRound.length === 0,
  '★★★ 正：没有一张票因为「轮次」被作废（invalidatedByRound 是 voidReviews 的 legacy 视图，这里是空）', cov3 && cov3.invalidatedByRound)
ok(!!cov3 && Array.isArray(cov3.voidReviews) && cov3.voidReviews.length === 0,
  '★★★ 正（TB-2761 D-2）：voidReviews 为空且显式 —— 没有票被作废，而不是「字段缺失被读成空」')
ok(!!cov3 && cov3.covered.length > 0 && cov3.covered.every((x) => typeof x.member === 'string' && typeof x.recordId === 'string' && Number(x.round) === 3),
  '★★★ 正：covered 每条的 recordId 可回指行、round 是当前轮', cov3 && cov3.covered)
for (const key of ['expectedMeans', 'coveredMeans', 'missingMeans', 'invalidatedByRoundMeans', 'means']) {
  ok(!!cov3 && typeof cov3[key] === 'string' && cov3[key].length > 40,
    '★★ 正：每值带 means 句 — `' + key + '` 存在且是可读整句', cov3 && typeof cov3[key] === 'string' && cov3[key].slice(0, 60))
}
ok(!!cov3 && typeof cov3.invalidatedByRoundMeans === 'string' && cov3.invalidatedByRoundMeans.includes('empty ON PURPOSE'),
  '★★ 正（TB-2761）：empty 列表的 means 说明「空是刻意的」，并把读者指向 covered / voidReviews', cov3 && cov3.invalidatedByRoundMeans)

// ── §2. THE SAME READING FLIPS TO covered ONCE THE THREE MEMBERS FILE FOR ROUND 3 ─────────────────────────────
console.log('=== 2. round 3 三席各投一次 ⇒ covered 三席、missing 为空 ===')
// TB-2743: a review binds the TEXT (and the round) it judged. Round 3 is writing, so each author
// re-files the part for THIS round before the three round-3 votes — the prose is the same, but the
// slot now carries round 3, which is what makes the verdicts below votes on the CURRENT text.
for (const [member, title] of [[ACAD, '§1 引言'], [R1, '§2 方法'], [R2, '§3 结论']]) {
  const refiled = (await receipt(v5r, 'vibe_v5_paper', { action: 'part', target: T, member, part: title, body: title + ' 的正文。' })).parsed
  ok(!!refiled && refiled.ok === true && refiled.part && Number(refiled.part.round) === 3,
    '前置(RULE E)：' + member + ' 为 round 3 重新提交了正文（本轮票才有当前正文可判）', refiled && refiled.part && { round: refiled.part.round, recordId: refiled.part.recordId })
}
const open3 = (await receipt(v5r, 'vibe_v5_paper', { action: 'advance', target: T })).parsed
eq(open3 && open3.advance && open3.advance.to, 'reviewing', '前置(RULE E)：round 3 进入 reviewing')
eq(open3 && open3.advance && Number(open3.advance.round), 3, '前置(RULE E)：round 3 的轮次号不动')
const v3A = (await receipt(v5r, 'vibe_v5_paper', { action: 'review', target: T, member: ACAD, deliverable: true, notes: 'round 3 可交付' })).parsed
const v3B = (await receipt(v5r, 'vibe_v5_paper', { action: 'review', target: T, member: R1, deliverable: true, notes: 'round 3 可交付' })).parsed
const v3C = (await receipt(v5r, 'vibe_v5_paper', { action: 'review', target: T, member: R2, deliverable: true, notes: 'round 3 可交付' })).parsed
ok([v3A, v3B, v3C].every((v) => v && v.ok === true && typeof (v.review && v.review.recordId) === 'string'),
  '前置(RULE E)：round 3 三票都写成了', [v3A, v3B, v3C].map((v) => v && v.review && v.review.recordId))
ok([v3A, v3B, v3C].every((v) => v && v.review && Number(v.review.judgedPartRound) === 3 && typeof v.review.judgedPartFingerprint === 'string'),
  '★★ 正：round 3 的每张票都绑定了它判的那份正文（指纹 + round 3），不是只记票',
  [v3A, v3B, v3C].map((v) => v && v.review && { round: v.review.judgedPartRound, fp: v.review.judgedPartFingerprint }))
const coveredWant = new Map([[ACAD, v3A.review.recordId], [R1, v3B.review.recordId], [R2, v3C.review.recordId]])
const done = (await receipt(v5r, 'vibe_v5_paper', { action: 'advance', target: T })).parsed
const advDone = done && done.advance
eq(advDone && advDone.to, 'awaiting-editor', '★★ 正：round 3 全员 deliverable ⇒ awaiting-editor')
eq(advDone && advDone.unanimous, true, '★★ 正：这一轮真的是 unanimous')
const covDone = advDone && advDone.perRoundReviewCoverage
ok(!!covDone && Number(covDone.round) === 3, '★★★ 正：读数停在 round 3', covDone && covDone.round)
ok(!!covDone && Array.isArray(covDone.covered) && covDone.covered.length === 3,
  '★★★ 正：covered 恰好三席（每席一张本轮 deliverable:true 的票）', covDone && covDone.covered)
eq(covDone && covDone.missing, [], '★★★ 正：missing 为空（不再等任何人）')
eq(covDone && covDone.invalidatedByRound, [], '★★★ 正：invalidatedByRound 为空 ON PURPOSE（本轮三票都是本轮的）')
ok(!!covDone && covDone.covered.length > 0 && covDone.covered.every((x) => x.recordId === coveredWant.get(x.member) && Number(x.round) === 3),
  '★★★ 正：covered 的每条 recordId 等于该成员 round-3 评审回执的 recordId、round 都是 3',
  covDone && covDone.covered.map((x) => ({ member: x.member, got: x.recordId, want: coveredWant.get(x.member) })))
ok(!!covDone && covDone.invalidatedByRoundMeans.includes('empty ON PURPOSE'),
  '★★ 正：空列表的 means 说明「空是刻意的」', covDone && covDone.invalidatedByRoundMeans)

// ── §3. THE TWO DOORS PRINT THE SAME OBJECT (ONE ARITHMETIC, NOT TWO) ─────────────────────────────────────────
console.log('=== 3. advance 门与 status 门给同一份读数（逐字相等） ===')
const st = (await receipt(v5r, 'vibe_v5_paper', { action: 'status', target: T })).parsed
ok(!!st && st.ok === true && st.exists === true, '前置(RULE E)：status 读得回这篇论文', st && st.exists)
ok(!!st && Object.prototype.hasOwnProperty.call(st, 'perRoundReviewCoverage'),
  '★★★ 正：status 门也带 `perRoundReviewCoverage`（上一轮的票在这里同样可读）', st && Object.keys(st).includes('perRoundReviewCoverage'))
eq(serialize(st && st.perRoundReviewCoverage), serialize(covDone),
  '★★★ 正：status 与 advance 的 `perRoundReviewCoverage` 逐字相等 — 两门共用一处算术（若 status 自己再算一份，这里红）')
eq(st && st.perRoundReviewCoverage && st.perRoundReviewCoverage.covered, covDone && covDone.covered,
  '★★★ 正：covered 集合逐字相等（RULE E 的 covered 断言）')
eq(serialize(st && st.perRoundReviewCoverage && st.perRoundReviewCoverage.covered),
  serialize([ACAD, R1, R2].map((member) => ({ member, recordId: coveredWant.get(member), round: 3 }))),
  '★★★ 正：cov 的顺序/形状也钉住：三席按 participants 顺序、字段恰是 member/recordId/round')
has(covDone && covDone.means, 'ONE question', '★★ 正：means 句自己声明「只回答一个问题」')

// ── §4. THE MECHANISM: THE BOUNCE IS REAL AND THIS READING IS NOT A SECOND GATE ───────────────────────────────
console.log('=== 4. 机制未被改掉：bounce 真实发生、字段只是读数 ===')
ok(!!adv3 && adv3.moved === true && Number(adv3.roundFrom) === 2 && Number(adv3.roundTo) === 3,
  '★★ 正：round 2 → 3 的 advance 真的 moved（读数没有取代状态机）', adv3 && { moved: adv3.moved, roundFrom: adv3.roundFrom, roundTo: adv3.roundTo })
ok(!!adv3 && Array.isArray(adv3.stale) && adv3.stale.length === 0,
  '★★ 正（RUN 76 现场）：三席都投了票，stale 为空（round 视图由 voidReviews 派生；跨轮未改正文的票现在计入 covered）',
  adv3 && adv3.stale)
eq(st && st.paper && Number(st.paper.round), 3, '★★ 正：status 的 paper.round 与读数一致（都是 3）')

try { process.chdir(prevCwd) } catch { /* the assertions above already read every byte they need */ }
await rm(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => {})
console.log('\n=== RUN-76 ROUND REVIEW COVERAGE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { for (const f of failures) console.error(' - ' + f); process.exit(1) }
