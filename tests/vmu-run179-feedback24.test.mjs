// ★ RUN 179 — the run's twenty-fifth reading (run 24 / FEEDBACK24): four defects about WHERE a fact is read from, and
// three readings that were only observations.
//   F24-1 A VOTE RECEIPT WAS ONE WRITE BEHIND ITS OWN WRITE. `vibe_vmu_vote` answered `writes:1` beside a `voters` row
//         that still named the PREVIOUS session and a `votersAsOf` still at the PREVIOUS instant — while the `status`
//         read a breath later answered the new one. The tally was right; the sentence a member reads to know whether
//         their judgement counted was not. The loop keeps the row it just wrote and the kernel merges it over the fold.
//   F24-2 `vibe_v5_read_library` answered `total` = the PAGE size (`limit:3` ⇒ total:3 for a track holding 14) while the
//         sentence beside it says `total` is the track's hit count. The read now walks the whole track and slices.
//   F24-4 A BOOT IS NOT AN AUTHOR. Hydration wrote `by: row.by || 'restore'`, so a verified row whose fold copy carried
//         no author came back from a restart with the literal verb `restore` as its AUTHOR — and a promotion made
//         without `member` had no author to carry. The face now records the caller; the kernel keeps an unknown author
//         unknown. The gate also stops demanding a truncated NAME as the claim (`requiredLineFull`).
//   F24-6 Two similar anchors and a refusal that showed a pointer cut at the first punctuation mark: the correction was a
//         guess. The refusal now names the nearby rows on the claimed track.
//   F24-7 `countOnly:true` beside `truncated:true` — nothing was cut, no rows were asked for. `truncated` is false and the
//         countable rest is `rowsOmitted`.
//   F24-3 A warning that fires every boot for a fact the fallback already decides is noise: one seated chair + an empty
//         DECLARED setting is not a leaderless institute (the setting is not durable by design), so the reading states
//         the assumption and the warning is kept only for real absence or real ambiguity.
// §0 is the source-side reading; everything after it is answered by this entry.

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const TURN = join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')
const KERNEL = join(REPO, 'vibe-math-vmu', 'kernel', 'index.js')
const TOOLS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
const QUALITY = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper-quality.js')
const LEAD = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'leadership.js')
const HANDLERS = join(REPO, 'vibe-math-vmu', 'kit', 'handlers.js')
const VERIFIED = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'verified.js')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const { leadershipReading, leadershipWarning } = await import(pathToFileURL(LEAD).href)
const { listVerified } = await import(pathToFileURL(VERIFIED).href)
const { readFile } = await import('node:fs/promises')
const turnSource = await readFile(TURN, 'utf8')
const kernelSource = await readFile(KERNEL, 'utf8')
const toolsSource = await readFile(TOOLS, 'utf8')
const qualitySource = await readFile(QUALITY, 'utf8')
const leadSource = await readFile(LEAD, 'utf8')
const handlersSource = await readFile(HANDLERS, 'utf8')
const verifiedSource = await readFile(VERIFIED, 'utf8')

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r179-')); roots.push(d); return d }

const boot = async (root, settings = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'], root }, settings))
  await handle.ready()
  await handle.kernel.store.open()
  return { handle, K: handle.kernel, specOf: (n) => state.specs.find((s) => s.name === n) }
}

const call = async (b, name, args, exec = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, exec) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
}
const codeOf = (r) => (r.thrown ? r.code : (r.parsed && r.parsed.code))
const hintOf = (r) => (r.thrown ? r.hint : (r.parsed && r.parsed.hint))
const messageOf = (r) => (r.thrown ? r.message : (r.parsed && r.parsed.message))

try {
  // ── §0 THE SOURCE-SIDE READING ──
  {
    console.log('§0 each repair is a named shape in the source (a pass cannot come from a coincidence)')
    ok(turnSource.includes('const closureVoteLocal = new Map()') && turnSource.includes('closureVoteLocalRows:'),
      '§0a the loop keeps the closure-vote row it just wrote, with its instant and session')
    ok(kernelSource.includes('closureVoteLocalRows') && kernelSource.includes('const byMember = new Map()'),
      '§0b the kernel MERGES that row over the fold row instead of opening a second ledger')
    ok(kernelSource.includes("settled: true, by: row.by === undefined || row.by === null || row.by === '' ? null : String(row.by)") &&
      !/records\.put\(\{[^}]*by: row\.by \|\| 'restore'/.test(kernelSource),
      '§0c a boot does not become an author (the `restore` verb is gone from hydration)')
    ok(toolsSource.includes('callerFromTurn(kernel, exec)') && toolsSource.includes('function toolVerifiedPromote(args = {}, { kernel, exec } = {})'),
      '§0d a promotion without `member` records its CALLER (or nobody), never a filler')
    ok(handlersSource.includes('records.list({ track, limit: 0 })') && handlersSource.includes('rowsOmitted:'),
      '§0e the library read walks the whole track and names the rows it did not return')
    ok(qualitySource.includes('requiredLineFull:') && verifiedSource.includes('statement: parsed.verified.statement'),
      '§0f the row\'s full statement travels with the head, so the gate can name the claim instead of a truncated name')
    ok(qualitySource.includes('nearby: nearby.map((r) => r.id)') && toolsSource.includes('相近的 '),
      '§0g a refused pointer names its neighbours (two similar anchors are a choice, not a guess)')
    ok(leadSource.includes('leaderAssumed:') && leadSource.includes("if (chairs.length === 1 && reading.leaderIdSource === 'seat') return null"),
      '§0h one seated chair + an empty DECLARED setting is stated, not warned about')
  }

  // ── §1 F24-1: the vote receipt answers for the vote it just wrote ──
  {
    console.log('§1 a vote receipt is not one write behind its own write (run 24 F24-1)')
    const root = await mkRoot()
    const b = await boot(root)
    await b.K.members.hire({ id: 'r-acad', slot: 'chair', institution: 'VibeMath' })
    await b.K.members.hire({ id: 'r-1', slot: 'member', institution: 'VibeMath' })
    await b.K.members.hire({ id: 'r-2', slot: 'member', institution: 'VibeMath' })
    const first = await call(b, 'vibe_vmu_vote', { member: 'r-1', solved: true }, { member: 'r-1' })
    const cv1 = first.parsed && first.parsed.closureVote
    ok(cv1 && cv1.votesCast === 1,
      '§1a the first vote is counted in its own receipt', cv1 && { votesCast: cv1.votesCast, voters: cv1.voters })
    const rows1 = (cv1 && Array.isArray(cv1.voters)) ? cv1.voters : []
    ok(rows1.length === 1 && String(rows1[0]).startsWith('r-1@'),
      '§1b and `voters` names THIS vote — one row, with a session, in the same receipt', rows1)
    ok(Number.isFinite(Number(cv1 && cv1.votersAsOf)) && Number(cv1.votersAsOf) > 0,
      '§1c the reading is DATED (votersAsOf is a real instant, not 0/null)', cv1 && cv1.votersAsOf)
    const second = await call(b, 'vibe_vmu_vote', { member: 'r-acad', solved: true }, { member: 'r-acad' })
    const cv2 = second.parsed && second.parsed.closureVote
    ok(cv2 && cv2.votesCast === 2 && Array.isArray(cv2.voters) && cv2.voters.length === 2,
      '§1d the second vote sees BOTH judgements in its receipt', cv2 && { votesCast: cv2.votesCast, voters: cv2.voters })
    ok(Number(cv2 && cv2.votersAsOf) >= Number(cv1 && cv1.votersAsOf),
      '§1e and the date moves forward with the write (a receipt cannot predate itself)', { first: cv1 && cv1.votersAsOf, second: cv2 && cv2.votersAsOf })
    const st = await call(b, 'vibe_vmu_status', { detail: 'closure' }, { member: 'r-acad' })
    const closure = (st.parsed && (st.parsed.closureVote || st.parsed)) || {}
    ok(closure.votesCast === 2 && Number(closure.votersAsOf) === Number(cv2.votersAsOf),
      '§1f the `status` reading and the vote receipt answer the SAME instant (one write, two readers)', { receipt: cv2 && cv2.votersAsOf, status: closure.votersAsOf })
  }

  // ── §2 F24-2 + F24-7: `total` is the track's hit count, and a count-only read cuts nothing ──
  {
    console.log('§2 `total` is the hit count and `truncated` is about rows (run 24 F24-2, F24-7)')
    const root = await mkRoot()
    const b = await boot(root)
    for (let i = 0; i < 5; i += 1) {
      const r = await call(b, 'vibe_v5_record_proposition', { statement: 'run179 命题 ' + i, value: 'v' + i, motive: 'm', p: 0.6, member: 'r-1' })
      ok(r.parsed && r.parsed.ok === true, '§2 setup: proposition ' + i + ' recorded', r.parsed && r.parsed.code)
    }
    const page = await call(b, 'vibe_v5_read_library', { track: 'propositions', limit: 2 })
    ok(page.parsed && page.parsed.total === 5,
      '§2a `total` is EVERY matching row, not this page (the page asked for 2 of 5)', page.parsed && { total: page.parsed.total, returned: page.parsed.returned })
    ok(page.parsed && page.parsed.returned === 2 && page.parsed.truncated === true,
      '§2b `returned` is the page and `truncated` tells you which one you got', page.parsed && { returned: page.parsed.returned, truncated: page.parsed.truncated })
    ok(page.parsed && typeof page.parsed.totalMeans === 'string' && page.parsed.totalMeans.includes('MATCHED'),
      '§2c the meaning is stated beside the number', page.parsed && page.parsed.totalMeans)
    const zero = await call(b, 'vibe_v5_read_library', { track: 'propositions', limit: 0 })
    ok(zero.parsed && zero.parsed.countOnly === true && zero.parsed.truncated === false && zero.parsed.rowsOmitted === 5,
      '§2d a count-only read reports NOTHING cut: `truncated:false` and `rowsOmitted` names the countable rest',
      zero.parsed && { countOnly: zero.parsed.countOnly, truncated: zero.parsed.truncated, rowsOmitted: zero.parsed.rowsOmitted })
    ok(zero.parsed && zero.parsed.total === 5,
      '§2e and its total is still the hit count', zero.parsed && zero.parsed.total)
  }

  // ── §3 F24-4: an unknown author stays unknown, and the gate names the full claim ──
  {
    console.log('§3 a boot is not an author, and a truncated NAME is not the claim (run 24 F24-4)')
    const root = await mkRoot()
    const b = await boot(root)
    await b.K.members.hire({ id: 'r-acad', slot: 'chair', institution: 'VibeMath' })
    await b.K.members.hire({ id: 'r-1', slot: 'member', institution: 'VibeMath' })
    const long = '对任意正整数 n 都有 Σ_{k=1}^{n} k² = n(n+1)(2n+1)/6，并且这个恒等式可以用归纳法在三步之内验完'
    const card = await call(b, 'vibe_v5_record_proposition', { statement: long, value: 'v', motive: 'm', p: 1, member: 'r-1',
      literature_ref: 'Euler, Introductio, p. 12' })
    const cardId = card.parsed && card.parsed.recordId
    ok(typeof cardId === 'string', '§3 setup: a settled card exists', card.parsed && card.parsed.code)
    // the OFFICE promotes (a member's seat face does not carry this tool — measured: `VMU_TOOL_NOT_IN_FACE`), and the
    // office has no seat, so the author is honestly absent; the CHAIR promotes too, and then the author is the chair.
    const promoted = await call(b, 'vibe_v5_verified_promote', { card: cardId, warrant_kind: 'literature',
      literature_ref: 'Euler, Introductio, p. 12' })
    ok(promoted.parsed && promoted.parsed.ok === true, '§3 setup: the promotion lands without `member`',
      promoted.parsed && (promoted.parsed.code || promoted.parsed.message))
    const listed = b.K.records.list({ track: 'verified', limit: 0 }) || []
    const rows = Array.isArray(listed) ? listed : (Array.isArray(listed.items) ? listed.items : [])
    const owners = rows.map((r) => String(r.by === undefined || r.by === null ? '(none)' : r.by))
    ok(!owners.includes('restore'),
      '§3a no verified row carries the verb `restore` as its AUTHOR', owners)
    ok(owners.includes('(none)'),
      '§3b the OFFICE promotion carries no author (an absent seat is null, not a verb)', owners)
    // and when a SEAT does the promoting, the row carries that seat's id — the caller, not a fill-in
    const card2 = await call(b, 'vibe_v5_record_proposition', { statement: long, value: 'v2', motive: 'm2', p: 1, member: 'r-1',
      literature_ref: 'Euler, Introductio, p. 12' })
    const promoted2 = await call(b, 'vibe_v5_verified_promote', { card: card2.parsed && card2.parsed.recordId,
      warrant_kind: 'literature', literature_ref: 'Euler, Introductio, p. 12' }, { agent: { id: 'r-acad' } })
    ok(promoted2.parsed && promoted2.parsed.ok === true, '§3b2 the chair can promote (its seat face carries the tool)',
      promoted2.parsed && (promoted2.parsed.code || promoted2.parsed.message))
    const rows2 = (() => { const l = b.K.records.list({ track: 'verified', limit: 0 }) || {}; return Array.isArray(l.items) ? l.items : [] })()
    ok(rows2.map((r) => String(r.owner === undefined || r.owner === null ? '(none)' : r.owner)).includes('r-acad'),
      '§3b3 a promotion made DURING a chair turn records that chair as the author', rows2.map((r) => r.owner))
    const listedV = listVerified(b.K.records)
    const items = listedV && Array.isArray(listedV.items) ? listedV.items : []
    const item = items.find((x) => String(x.cardId) === String(cardId)) || items[0] || null
    ok(item && typeof item.statement === 'string' && item.statement.includes('2n+1)/6'),
      '§3c the verified head carries the row\'s FULL statement (the name is truncated at 48 chars, the claim is not)',
      item && { title: item.title, statement: item.statement })
    ok(item && String(item.title).length <= 60 && String(item.title).endsWith('…'),
      '§3d and its name really is the truncated one (this is why the full claim has to travel)', item && item.title)
    ok(qualitySource.includes('requiredLineFull:') && qualitySource.indexOf('requiredLineFull') > qualitySource.indexOf('requiredLineTruncated'),
      '§3e the paper gate offers the full claim beside the truncated name')
  }

  // ── §4 F24-6: a refused pointer names its neighbours ──
  {
    console.log('§4 a refused pointer is a choice, not a guess (run 24 F24-6)')
    const root = await mkRoot()
    const b = await boot(root, { 'vmu.paper.officeConsult': 'off' })
    const card = await call(b, 'vibe_v5_record_proposition', { statement: 'run179 引文', value: 'v', motive: 'm', p: 0.6, member: 'r-1' })
    const cardId = card.parsed && card.parsed.recordId
    const started = await call(b, 'vibe_v5_paper', { action: 'start', target: 'r179', participants: ['r-1', 'r-2'] })
    ok(started.parsed && started.parsed.ok === true, '§4 setup: the paper starts', started.parsed && started.parsed.code)
    const bad = await call(b, 'vibe_v5_paper', { action: 'part', target: 'r179', member: 'r-1', part: '1 坏指针',
      body: '证据见 Members/r-1/Propos/' + String(cardId) + '-typo.md#二、相近锚点。' })
    ok(codeOf(bad) === 'VMU_PACK_V5R_CORE_PAPER_CITATION_UNKNOWN',
      '§4a the fabricated pointer is refused', codeOf(bad))
    const msg = messageOf(bad)
    ok(typeof msg === 'string' && msg.includes('相近的'),
      '§4b and the refusal names rows that resemble it (so a mistyped id is a correction, not a search)', msg)
    ok(typeof msg === 'string' && msg.includes(String(cardId)),
      '§4c the neighbour named IS the row the author meant', { message: msg, cardId })
  }

  // ── §5 F24-3: one seated chair and an empty declared setting is not a defect ──
  {
    console.log('§5 a warning that fires every boot for a fact the fallback decides is noise (run 24 F24-3)')
    const one = leadershipReading({ roster: [{ id: 'r-acad', slot: 'chair', state: 'active' }], leaderId: '',
      leaderSlot: 'chair' })
    const assumed = one && (one.leaderAssumed || null)
    ok(assumed && assumed.effectiveLeaderId === 'r-acad' && assumed.source === 'seat',
      '§5a the reading STATES the assumption (one chair, empty DECLARED setting ⇒ that seat leads)', one && one.leaderAssumed)
    ok(assumed && typeof assumed.means === 'string' && assumed.means.includes('not'),
      '§5b and says the institute is not leaderless')
    const warn = leadershipWarning(Object.assign({ code: 'chair-seated-but-leaderId-empty', consistent: false,
      leaderIdSource: 'seat', seatedChairs: ['r-acad'], note: 'n' }))
    ok(warn === null,
      '§5c so the per-boot warning is GONE for that shape (the fallback decides it)', warn)
    const two = leadershipWarning({ code: 'chair-seated-but-leaderId-empty', consistent: false,
      leaderIdSource: 'seat', seatedChairs: ['r-acad', 'r-2'], note: 'n' })
    ok(two && two.code === 'chair-seated-but-leaderId-empty' && typeof two.message === 'string' && two.message.includes('more than one chair'),
      '§5d but real AMBIGUITY (two seated chairs) still warns — that one needs a name', two)
  }
} finally {
  for (const d of roots) { try { await rm(d, { recursive: true, force: true }) } catch { /* best effort */ } }
}

console.log('')
if (failed === 0) console.log('=== VMU RUN179 FEEDBACK24 TRUTH: ' + passed + ' passed, 0 failed ===')
else { console.log('=== VMU RUN179 FEEDBACK24 TRUTH: ' + passed + ' passed, ' + failed + ' FAILED ==='); process.exitCode = 1 }
