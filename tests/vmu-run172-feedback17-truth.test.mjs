// tests/vmu-run172-feedback17-truth.test.mjs — RUN 172 (real machine, run 17 / FEEDBACK17).
//
// THE DEFECTS THIS PINS (measured on the real machine, run 17, build eb53b2b3):
//   · P1-A: a FABRICATED citation walked through render, final and the PDF compile. The gate scanned one pointer per
//     LINE (`line.match(MEMBER_FILE)`), and the member wrote the good pointer and the bad one in the same paragraph —
//     only the first was judged. A part whose body is prose (not a JSON envelope) was skipped entirely (`if (!part)
//     continue`), so every citation in it was invisible too.
//   · P1-C: `advance` answered `deliverable:false` about a review row whose own body says `true` — the row belonged to
//     another round. That is a ROUND MISMATCH, not a vote the member cast, and the receipt now says so.
//   · P2: a restored row kept the adoption marker `fingerprint:"tombstone:<id>"` as its content fingerprint, so two
//     kernels disagreed about the same live row (`fingerprintOk:false` in one of them).
//   · P2-6: the institute-wide closure tally had no window: a fresh run opened with `votesCast:3` inherited from the
//     previous question and no receipt could start over. `reopen-closure` is the named entry; old votes stay on file.
//   · P3-9: the same paper-name refusal came in two shapes (trashed ⇒ no top-level `stateRecordId`/`status`).
//   · P3-16: `paper status` said `exists:false` about a name sitting in the TRASH, as if it never existed.
//
// RULE E: every collection assertion states its non-emptiness (or exact shape) in the same expression.
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { cpSync, readFileSync, writeFileSync } from 'node:fs'

import { tmpRoot as __tmpRoot } from './_lib/scratch.mjs'
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

const entry = await import(pathToFileURL(ENTRY).href)
const qualityMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper-quality.js')).href)
const BASE = __tmpRoot() + '/r172/truth'
const roots = []
const newRoot = async (tag) => { await mkdir(BASE, { recursive: true }); const r = await mkdtemp(join(BASE, tag + '-')); roots.push(r); return r }
let tick = 1000
const boot = async (root, entryUrl = null) => {
  const specs = []
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const activeEntry = entryUrl === null ? entry : await import(entryUrl)
  const handle = activeEntry.apply(ctx, { root, packs: ['v5r'], clock: () => tick })
  await handle.ready()
  const call = async (name, args) => {
    const spec = specs.filter((s) => s.name === name)[0]
    if (!spec) throw new Error('no tool ' + name)
    try { return JSON.parse(await spec.execute(args, {})) } catch (e) {
      return { ok: false, code: (e && e.code) || 'THROW', message: String((e && e.message) || e), hint: (e && e.hint) || null }
    }
  }
  return { handle, kernel: handle.kernel, call }
}
const SEATS = [['r-acad', 'chair'], ['r-1', 'member'], ['r-2', 'member']]
const hire = async (k) => { for (const [id, slot] of SEATS) await k.members.hire({ id, slot, institution: 'inst' }) }
const qualityOf = async (A, target) => {
  const st = await A.call('vibe_v5_paper', { action: 'status', target })
  const state = Object.assign({}, st.paper, { status: 'awaiting-editor' })
  const view = qualityMod.createRecordsView({ kernel: A.kernel, codes: qualityMod.QUALITY_CODES })
  return qualityMod.checkQuality({ md: '', state, view, codes: qualityMod.QUALITY_CODES })
}

// ── §0 the source says what this pins ───────────────────────────────────────────────────────────────────────────────
{
  const quality = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper-quality.js'), 'utf8')
  const kit = readFileSync(join(REPO, 'vibe-math-vmu', 'kit', 'paper.js'), 'utf8')
  const records = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'records.js'), 'utf8')
  const index = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js'), 'utf8')
  const turn = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js'), 'utf8')
  const tools = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')
  const turnFace = readFileSync(join(REPO, 'vibe-math-vmu', 'tools', 'turn.js'), 'utf8')
  const store = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'store.js'), 'utf8')
  const channel = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-reply-channel.js'), 'utf8')
  ok(/function eachMemberFile\(line, push\) \{/.test(quality) && /new RegExp\(MEMBER_FILE\.source, 'g'\)/.test(quality),
    '§0 the citation scan walks EVERY pointer on a line (one match per line hid run 17\'s fabricated pointer)')
  ok(/origin: 'prose-raw'/.test(quality) && /if \(part === null \|\| typeof part !== 'object'\) \{/.test(quality),
    '§0 a part whose body is prose is scanned as text instead of being skipped')
  ok(/rowDeliverable: body\.deliverable === true/.test(kit) && /ROUND MISMATCH, not a member refusing/.test(kit),
    '§0 a stale review row carries its OWN reading (`rowDeliverable`) and names the mismatch')
  ok(/startsWith\('tombstone:'\)\) rec\.fingerprint = fingerprintOf\(rec\)/.test(records),
    '§0 restoring a row replaces the adoption marker with a recomputed content fingerprint')
  ok(/async reopenClosureVote\(\{ why = null, by = null \} = \{\}\)/.test(index) && /const CLOSURE_WINDOW_FOLD = 'closure_window'/.test(index),
    '§0 the closure tally has a durable window and a named opener')
  ok(/'closure_window',/.test(store),
    '§0 …and the key is DECLARED (an undeclared key is refused by name, i.e. the window a no-op — the RUN 169 lesson)')
  ok(/resetClosureVotes = \(\) => \{/.test(turn) && /resetClosureVotes,/.test(turn),
    '§0 the loop can clear its own in-memory half of the tally')
  ok(/if \(op === 'reopen-closure'\) \{/.test(turnFace) && /reopen-closure/.test(turnFace),
    '§0 `vibe_vmu_turn {op:"reopen-closure"}` exists as the office-reachable entry')
  ok(/inTrash: true, trash: held/.test(kit) && /stateRecordId: held\.recordId, status: 'trashed'/.test(kit),
    '§0 the trashed-name refusal carries the same top-level shape as the live-name refusal')
  ok(/const trashLookup = \(word\) =>/.test(kit) && /inTrash: inTrash !== null/.test(tools),
    '§0 `paper status` can say the name exists in the TRASH')
  ok(/本所该键＝`refuse`/.test(channel) && /自造键按/.test(channel) === false,
    '§0 the reply-channel prompt says what this institute declares (`refuse`), not "ignored by default"')
}

// ── §1 two pointers in ONE paragraph: both are judged ──────────────────────────────────────────────────────────────
{
  const root = await newRoot('same-line')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  const good = A.kernel.records.put({ track: 'propositions', kind: 'proposition', title: 'a real card', body: '二值：1' })
  ok(!!good && !!good.id, '§1 the cited card is on the propositions track', good && good.id)
  await A.call('vibe_v5_paper', { action: 'start', target: 'p1', participants: ['r-acad', 'r-1'] })
  const solution = '可寻址的一处：Members/r-1/Propos/' + good.id + '.md#命题陈述 是对的；不可寻址的一处：Members/r-1/Propos/run17-not-a-record.md#§3 是编的。'
  // ★★ RUN 177 (run 22, FEEDBACK22 D3): the WRITE gate now resolves prose pointers too, so this body is refused at
  // `part`. What this section pins is the GATE's reading of such a body (both pointers on one line, not just the first),
  // so the row is written directly the way `recordPart` shapes it — bypassing the write gate on purpose, exactly as §2
  // and run 173 §3 do.
  const refusedAtWrite = await A.call('vibe_v5_paper', { action: 'part', target: 'p1', member: 'r-acad', part: 'two pointers in one paragraph', solution, evidence: [String(good.id)] })
  ok(refusedAtWrite.ok === false && refusedAtWrite.code === 'VMU_PACK_V5R_CORE_PAPER_CITATION_UNKNOWN',
    '§1 ★★ the fabricated pointer is refused where it is typed (RUN 177 D3)', refusedAtWrite && refusedAtWrite.code)
  const partRow = A.kernel.records.put({ track: 'paper', kind: 'paper-part', title: 'v5r-paper|p1|part|r-acad', by: 'r-acad',
    body: JSON.stringify({ title: 'two pointers in one paragraph', solution, evidence: [String(good.id)] }) })
  ok(!!partRow && !!partRow.id, '§1 the part row is on disk (this section pins the GATE, not the write gate)', partRow && partRow.id)
  const stateOfP1 = A.kernel.records.list({ track: 'paper', limit: 2000 }).items.filter((r) => r.kind === 'paper-state')[0]
  if (stateOfP1) {
    const fullState = A.kernel.records.get({ id: stateOfP1.id })
    const stateBody = fullState && fullState.record ? fullState.record.body : (fullState ? fullState.body : null)
    const body = JSON.parse(String(stateBody))
    body.parts = { 'r-acad': { recordId: partRow.id, round: 1 } }
    body.status = 'awaiting-editor'
    A.kernel.records.put({ track: 'paper', kind: 'paper-state', title: stateOfP1.title, body: JSON.stringify(body), id: stateOfP1.id })
  }
  const verdict = await qualityOf(A, 'p1')
  ok(verdict && verdict.ok === false, '§1 ★★ the gate REFUSES the paper (run 17: the second pointer was never judged)', verdict && verdict.ok)
  ok(verdict && verdict.code === qualityMod.QUALITY_CODES.CITATION_UNKNOWN,
    '§1 …with the CITATION_UNKNOWN verdict', verdict && verdict.code)
  const miss = (verdict && Array.isArray(verdict.missing)) ? verdict.missing : []
  ok(miss.length === 1, '§1 exactly ONE citation is unknown (the good one resolved, the fabricated one did not)', miss.map((m) => m.id))
  ok(miss.length === 1 && String(miss[0].id) === 'run17-not-a-record',
    '§1 …and it is the SECOND pointer on that line (the one `match()` used to drop)', miss.length === 1 ? miss[0].id : miss)
  ok(miss.length === 1 && String(miss[0].path).includes('#§3'),
    '§1 …and the verdict carries the offending path WITH its anchor', miss.length === 1 ? miss[0].path : miss)
}

// ── §2 a part whose body is prose is still a part somebody wrote ────────────────────────────────────────────────────
{
  const root = await newRoot('prose-part')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  await A.call('vibe_v5_paper', { action: 'start', target: 'p2', participants: ['r-acad', 'r-1'] })
  // The durable part row holds PLAIN TEXT (what a member writes when it ignores the JSON envelope — run 17 did exactly
  // that). `recordPart` is bypassed on purpose: this pins the GATE reading such a row, not the kit writing one.
  const stated = A.kernel.records.put({ track: 'paper', kind: 'paper-state', title: 'durable paper state for p2',
    body: JSON.stringify({ target: 'p2', round: 1, status: 'writing', participants: ['r-acad', 'r-1'], parts: {} }) })
  void stated
  const st = await A.call('vibe_v5_paper', { action: 'status', target: 'p2' })
  const stateId = st.paper && st.paper.stateRecordId ? st.paper.stateRecordId : null
  const prose = '本节引用 Members/r-1/Propos/run17-prose-only.md#结论 这个不存在的记录。'
  const rows = A.kernel.records.list({ track: 'paper', limit: 2000 }).items.filter((r) => r.kind === 'paper-part')
  ok(rows.length === 0, '§2 no JSON part row exists yet (this section writes the prose row directly)', rows.length)
  const partRow = A.kernel.records.put({ track: 'paper', kind: 'paper-part', title: 'v5r-paper|p2|part|r-1', body: prose, by: 'r-1' })
  ok(!!partRow && !!partRow.id, '§2 the prose part row is on disk', partRow && partRow.id)
  // Point the paper state's parts map at that row, the way `recordPart` would.
  let state = null
  if (stateId) {
    const got = A.kernel.records.get({ id: stateId })
    const full = got && got.record ? got.record : got
    state = JSON.parse(String(full.body))
    state.parts = { 'r-1': { recordId: partRow.id, round: 1 } }
    A.kernel.records.put({ track: 'paper', kind: 'paper-state', title: String(full.title), body: JSON.stringify(state), by: 'office' })
  }
  const view = qualityMod.createRecordsView({ kernel: A.kernel, codes: qualityMod.QUALITY_CODES })
  const live = state || { target: 'p2', round: 1, status: 'awaiting-editor', participants: ['r-acad', 'r-1'], parts: { 'r-1': { recordId: partRow.id, round: 1 } } }
  const verdict = qualityMod.checkQuality({ md: '', state: Object.assign({}, live, { status: 'awaiting-editor' }), view, codes: qualityMod.QUALITY_CODES })
  ok(verdict && verdict.ok === false && verdict.code === qualityMod.QUALITY_CODES.CITATION_UNKNOWN,
    '§2 ★★ a citation inside a NON-JSON part body is judged (before RUN 172 the whole part was skipped)', verdict && verdict.code)
  const miss = (verdict && Array.isArray(verdict.missing)) ? verdict.missing : []
  ok(miss.length === 1 && String(miss[0].origin) === 'prose-raw',
    '§2 …and the verdict names where the text came from (`prose-raw`)', miss.length === 1 ? miss[0].origin : miss)
  ok(miss.length === 1 && String(miss[0].id) === 'run17-prose-only',
    '§2 …with the id normalized (no `.md#anchor` suffix)', miss.length === 1 ? miss[0].id : miss)
}

// ── §3 a review row from another round is a MISMATCH, not a refusal ────────────────────────────────────────────────
{
  const root = await newRoot('stale-review')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  await A.call('vibe_v5_paper', { action: 'start', target: 'p3', participants: ['r-acad', 'r-1'] })
  await A.call('vibe_v5_paper', { action: 'part', target: 'p3', member: 'r-acad', part: 'part one', solution: '正文 one', evidence: [] })
  await A.call('vibe_v5_paper', { action: 'part', target: 'p3', member: 'r-1', part: 'part two', solution: '正文 two', evidence: [] })
  const openRaw = await A.call('vibe_v5_paper', { action: 'advance', target: 'p3' })
  const open = (openRaw && openRaw.advance) || openRaw || {}
  ok(openRaw.ok === true && open.to === 'reviewing', '§3 the paper opens for cross review', { to: open.to, reviewOf: open.reviewOf })
  // Round 1: r-acad says deliverable about r-1's part; r-1 refuses because of r-acad's part ⇒ a disagreement pushes the
  // paper into round 2, and BOTH round-1 rows stay on disk.
  const rv1 = await A.call('vibe_v5_paper', { action: 'review', target: 'p3', member: 'r-acad', of: 'r-1', deliverable: true, comments: 'round one ok' })
  ok(rv1.ok === true, '§3 the round-1 review is recorded', rv1.code)
  const rv2 = await A.call('vibe_v5_paper', { action: 'review', target: 'p3', member: 'r-1', of: 'r-acad', deliverable: false, comments: 'round one needs work' })
  ok(rv2.ok === true, '§3 the round-1 disagreement is recorded', rv2.code)
  const adv1Raw = await A.call('vibe_v5_paper', { action: 'advance', target: 'p3' })
  const adv1 = (adv1Raw && adv1Raw.advance) || adv1Raw || {}
  ok(adv1Raw.ok === true && adv1.to === 'writing' && adv1.round === 2,
    '§3 the disagreement moves the paper into round 2', { to: adv1.to, round: adv1.round })
  const reopenRaw = await A.call('vibe_v5_paper', { action: 'advance', target: 'p3' })
  const reopen = (reopenRaw && reopenRaw.advance) || reopenRaw || {}
  ok(reopenRaw.ok === true && reopen.to === 'reviewing', '§3 round 2 opens for cross review', reopen.to)
  tick += 10
  const adv2Raw = await A.call('vibe_v5_paper', { action: 'advance', target: 'p3' })
  const adv2 = (adv2Raw && adv2Raw.advance) || adv2Raw || {}
  const reads = Array.isArray(adv2.reviewsRead) ? adv2.reviewsRead : []
  // ★★★ TB-2761（RUN 81 D-1）：判据是「被判节 fingerprint 是否变」，不是「round 是否等于论文 round」。round 1 → 2 时
  // 正文没有被改：r-acad 的 deliverable:true 票仍然 COUNTED（不是 round mismatch）；r-1 的 deliverable:false 票判的也是
  // 未改正文，所以它仍然是一次**拒收**（不是「本轮缺席」）。旧断言「stale>=1」的旧语义被 TB-2761 取代。
  const stale = reads.filter((r) => r && r.source === 'durable-other-round')
  ok(stale.length === 0, '§3（TB-2761）跨轮但正文未变的票不再被标成 durable-other-round', reads.map((r) => [r.member, r.source]))
  ok(reads.some((r) => r && r.member === 'r-acad' && r.source === 'durable' && r.deliverable === true && r.countedFromEarlierRound === true),
    '§3 ★★ r-acad 的第 1 轮 deliverable 票跨轮仍计数（回执点名 countedFromEarlierRound）', reads)
  ok(reads.some((r) => r && r.member === 'r-1' && r.source === 'durable' && r.deliverable === false),
    '§3 ★ r-1 的 deliverable:false 票判的是未改正文 ⇒ 仍是拒收（不是 round mismatch）', reads)
  ok(adv2Raw.ok === true && adv2.to === 'writing' && Array.isArray(adv2.refusers) && adv2.refusers.indexOf('r-1') !== -1,
    '§3 这一轮不 unanimous 的原因是真拒收 r-1：回执照旧退回 writing', { to: adv2.to, refusers: adv2.refusers })
  const cov172 = adv2.perRoundReviewCoverage
  ok(cov172 && Array.isArray(cov172.covered) && cov172.covered.some((x) => x.member === 'r-acad') && Array.isArray(cov172.missing) && cov172.missing.indexOf('r-1') !== -1,
    '§3 ★ TB-2761 读数：covered 含跨轮的 r-acad、missing 是拒收的 r-1', cov172 && { covered: cov172.covered, missing: cov172.missing })
  ok(cov172 && Array.isArray(cov172.voidReviews) && cov172.voidReviews.length === 0,
    '§3 voidReviews 为空且显式（没有票因为轮次被作废）', cov172 && cov172.voidReviews)
  // ★ TB-2761 反灯：把指纹绑定退回 round 绑定 ⇒ 同一场景里 r-acad 的第 1 轮票必须重新变成 round mismatch。
  {
    const dir = await mkdtemp(join(__tmpRoot(), 'run172-lamp-'))
    try {
      cpSync(join(REPO, 'vibe-math-vmu'), join(dir, 'vibe-math-vmu'), { recursive: true })
      const kitPath = join(dir, 'vibe-math-vmu', 'kit', 'paper.js')
      const src = readFileSync(kitPath, 'utf8')
      const from = "if (judged.partChanged) return out(false, 'part-text-changed')"
      ok(src.indexOf(from) !== -1, '§3 lamp-setup：指纹绑定判据存在')
      let mutated = src.replace(from, "if (rowRound !== round) return out(false, 'part-text-changed')")
      const fromRound = 'if (crossEarlier && judgedEarlier.bound === true && !judgedEarlier.partChanged) {'
      ok(mutated.indexOf(fromRound) !== -1, '§3 lamp-setup：readReview 的跨轮计数分支存在')
      mutated = mutated.replace(fromRound, 'if (false) {')
      writeFileSync(kitPath, mutated)
      const root2 = await newRoot('stale-lamp')
      const B = await boot(root2, pathToFileURL(join(dir, 'vibe-math-vmu', 'vibe-math-vmu.js')).href + '?lamp=1')
      await hire(B.kernel)
      await B.call('vibe_v5_paper', { action: 'start', target: 'p3l', participants: ['r-acad', 'r-1'] })
      await B.call('vibe_v5_paper', { action: 'part', target: 'p3l', member: 'r-acad', part: 'part one', solution: '正文 one', evidence: [] })
      await B.call('vibe_v5_paper', { action: 'part', target: 'p3l', member: 'r-1', part: 'part two', solution: '正文 two', evidence: [] })
      await B.call('vibe_v5_paper', { action: 'advance', target: 'p3l' })
      await B.call('vibe_v5_paper', { action: 'review', target: 'p3l', member: 'r-acad', of: 'r-1', deliverable: true, comments: 'one' })
      await B.call('vibe_v5_paper', { action: 'review', target: 'p3l', member: 'r-1', of: 'r-acad', deliverable: false, comments: 'two' })
      await B.call('vibe_v5_paper', { action: 'advance', target: 'p3l' })
      await B.call('vibe_v5_paper', { action: 'advance', target: 'p3l' })
      const lampRaw = await B.call('vibe_v5_paper', { action: 'advance', target: 'p3l' })
      const lamp = (lampRaw && lampRaw.advance) || lampRaw || {}
      const lampReads = Array.isArray(lamp.reviewsRead) ? lamp.reviewsRead : []
      ok(lamp.code === 'VMU_REVIEW_STALE' || lampReads.some((r) => r && r.source === 'durable-other-round'),
        '§3 lamp RED-worthy：退回 round 绑定 ⇒ 跨轮票又被当成作废（VMU_REVIEW_STALE 或 durable-other-round；run 81 D-1 的原状）', { code: lamp.code, reads: lampReads.map((r) => [r.member, r.source]) })
    } finally { await rm(dir, { recursive: true, force: true }) }
  }
}

// ── §4 restore recomputes the content fingerprint ──────────────────────────────────────────────────────────────────
{
  const root = await newRoot('restore-fp')
  const A = await boot(root)
  const row = A.kernel.records.put({ track: 'paper', kind: 'paper-part', title: 'restorable', body: 'body to restore', by: 'r-acad' })
  ok(!!row && !!row.id, '§4 the row exists', row && row.id)
  A.kernel.records.remove({ id: row.id, by: 'r-acad' })
  const back = A.kernel.records.restore({ id: row.id, by: 'r-acad' })
  ok(back && back.ok === true, '§4 the row is restored', back && back.ok)
  const got = A.kernel.records.get({ id: row.id })
  const full = got && got.record ? got.record : got
  const fp = String((full && full.fingerprint) || '')
  ok(fp !== '' && !fp.startsWith('tombstone:'),
    '§4 ★★ a restored live row carries a CONTENT fingerprint, not the adoption marker (two kernels disagreed about run 17\'s row)', fp)
}

// ── §5 a name in the TRASH refuses in the same shape as a live name ────────────────────────────────────────────────
{
  const root = await newRoot('trash-shape')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  await A.call('vibe_v5_paper', { action: 'start', target: 'p10', participants: ['r-acad', 'r-1'] })
  const pruned = await A.call('vibe_vmu_records', { action: 'prune', track: 'paper', keep: 0, why: 'trash it' })
  ok(pruned.ok === true && pruned.prunedCount >= 1, '§5 the paper rows went to the trash', pruned && pruned.prunedCount)
  tick += 10
  const denied = await A.call('vibe_v5_paper', { action: 'start', target: 'p10', participants: ['r-acad', 'r-1'] })
  ok(denied.ok === false && denied.code === 'VMU_PACK_V5R_CORE_PAPER_STATE',
    '§5 the name is refused while its row sits in the trash', { code: denied.code })
  ok(!!denied.stateRecordId, '§5 ★ the refusal carries a top-level `stateRecordId` (run 17: only the nested `trash` block had it)', denied.stateRecordId)
  ok(denied.status === 'trashed' && denied.inTrash === true,
    '§5 …and top-level `status:"trashed"` / `inTrash:true`', { status: denied.status, inTrash: denied.inTrash })
  const read = await A.call('vibe_v5_paper', { action: 'status', target: 'p10' })
  ok(read.ok === true && read.exists === false && read.inTrash === true,
    '§5 ★★ `paper status` says the name EXISTS IN THE TRASH instead of `exists:false` alone', { exists: read.exists, inTrash: read.inTrash })
  ok(read.trash && !!read.trash.recordId,
    '§5 …with the trash row\'s recordId so the reader can act on it', read.trash)
}

// ── §6 the closure tally can start a new window, and the old votes stay on file ─────────────────────────────────────
{
  const root = await newRoot('closure-window')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  await A.call('vibe_vmu_vote', { member: 'r-acad', solved: true })
  tick += 10
  await A.call('vibe_vmu_vote', { member: 'r-1', solved: true })
  const before = A.kernel.closureVoteView()
  ok(before.votesCast === 2 && before.missing.length === 1,
    '§6 two votes are counted and the third seat is named missing', { votesCast: before.votesCast, missing: before.missing })
  ok(Array.isArray(before.voters) && before.voters.length === 2 && before.voters.every((v) => /^r-(acad|1)@/.test(String(v))),
    '§6 ★ `voters` names who voted and from where (`member@session`; run 17: two field names, no readable list)', before.voters)
  tick += 10
  const reopened = await A.call('vibe_vmu_turn', { op: 'reopen-closure', why: 'run 172 test' })
  ok(reopened.ok === true && reopened.window === 2 && reopened.previousWindow === 1,
    '§6 ★★ the office opens a NEW window by name', { window: reopened.window, previousWindow: reopened.previousWindow })
  ok(reopened.archivedVotes === 2 && reopened.sessionVotesCleared === 2,
    '§6 …and the receipt says how many votes it left behind and how many it cleared in memory', { archived: reopened.archivedVotes, cleared: reopened.sessionVotesCleared })
  const after = A.kernel.closureVoteView()
  ok(after.votesCast === 0 && after.missing.length === 3,
    '§6 ★★ the old votes no longer count (run 17: a fresh question opened with `votesCast:3` inherited)', { votesCast: after.votesCast, missing: after.missing.length })
  tick += 10
  await A.call('vibe_vmu_vote', { member: 'r-2', solved: true })
  const fresh = A.kernel.closureVoteView()
  ok(fresh.votesCast === 1 && fresh.votesCast < before.votesCast + 1,
    '§6 …and a new vote starts the new window at one', { votesCast: fresh.votesCast })
  const statusOf = await A.call('vibe_vmu_turn', { op: 'status', detail: 'closure' })
  ok(statusOf.ok === true && statusOf.closureVote && statusOf.closureVote.votesCast === 1,
    '§6 the reading is on the turn face too (and it is the WINDOWED one)', statusOf.closureVote && statusOf.closureVote.votesCast)
}

for (const r of roots) await rm(r, { recursive: true, force: true, maxRetries: 3 })
console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + ' ' + passed + ' passed, ' + failed + ' failed')
if (failed) { console.log('failures:'); for (const f of failures) console.log(' - ' + f); process.exit(1) }
