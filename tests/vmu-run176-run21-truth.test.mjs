// tests/vmu-run176-run21-truth.test.mjs — RUN 176 (real machine, run 21 / FEEDBACK21).
//
// THE DEFECTS THIS PINS (measured on the real machine, run 21, build 2c8ffef5):
//   A1/F1 a paper whose `final` FAILED to compile was marked `finalized:true` anyway, so `revise` refused ("not awaiting
//         its editor"), `compile` re-typeset the same broken source and `part` only writes while writing: ONE typo in
//         `paper-p17` forced a brand-new paper (run 21 lost half its paper steps to this).
//   A1/F2 the gate handed over a `requiredLineMath` that wrapped a WHOLE sentence — including the identifier
//         `n_plus_n_eq_two_n` — in `$…$`. In math mode every `_` is a subscript, so xelatex answered
//         `! Double subscript.`: following the gate's own advice produced a PDF-less paper, and then F1 deadlocked it.
//   A2/F3 `paper status.pdfCompiled` answered `produced:false, recordId:null` while the PDF existed (`rec-601/605`,
//         112 268 bytes on disk). A `paper-pdf` row is named `v5r-paper|<TARGET>|pdf` where TARGET is the HUMAN title
//         given to `start`, but the lookup compared the MIDDLE segment against the ADDRESSED id ⇒ it matched nothing.
//   A3/F4 `records status` printed `refusalsTotal` 0→1→2 with no name: the kernel has published `lastRefusal` since
//         RUN 175, and this projection silently dropped it.
//   A4/F5 a card whose claim is longer than 48 chars is named by its first 48 chars + `…`; that truncated name reaches
//         the Verified row and the `requiredLine` gate then demanded the writer copy the ELLIPSIS verbatim.
//
// WHAT RUN 176 CHANGED:
//   · `packs/v5r/tools.js`  `pdfCompiled` matches BOTH spellings (target title / minted id) and says `matchedBy`.
//   · `host.js`             `records status` carries `lastRefusal` + `lastRefusalMeans`.
//   · `packs/v5r/paper-quality.js`  `safeForm` only recommends `$…$` when the line has NO identifier; a truncated name
//     asks for the PREFIX (never the ellipsis), and each missing item names `requiredLine(Truncated|Math|Identifier)`.
//   · `kit/paper.js`        a compile that really RAN and FAILED rolls the finalisation back (`finalized:false`,
//     `rolledBack`, `reviseAvailable:true`); a missing LaTeX FACE is an environment gap and still finalises; a
//     `finalized` paper with no PDF row can be repaired by `final {decision:"revise"}`.
//
// RULE E: every collection assertion states its non-emptiness (or exact shape) in the same expression.
import { mkdtemp, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

import { tmpRoot as __tmpRoot } from './_lib/scratch.mjs'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const PACK_PAPER = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper.js')

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
const pack = await import(pathToFileURL(PACK_PAPER).href)
const qualityMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper-quality.js')).href)
const BASE = __tmpRoot() + '/r176/run21'
const newRoot = async (tag) => { await mkdir(BASE, { recursive: true }); return mkdtemp(join(BASE, tag + '-')) }
let tick = 1000
const boot = async (root) => {
  const specs = []
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { root, packs: ['v5r'], clock: () => tick++ })
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
const SEATS = [['r-acad', 'chair'], ['r-1', 'member'], ['r-2', 'member'], ['r-temp', 'temp']]
const hire = async (k) => { for (const [id, slot] of SEATS) await k.members.hire({ id, slot, institution: 'inst' }) }
const missingOf = (v) => (v && Array.isArray(v.missing) ? v.missing : [])
const pdfRow = (kernel, title, body) => kernel.records.put({
  track: 'paper', kind: 'paper-pdf', title, body: JSON.stringify(body), settled: true, by: 'r-acad' })

// ── §0 the source says what this pins ───────────────────────────────────────────────────────────────────────────────
{
  const tools = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')
  const host = readFileSync(join(REPO, 'vibe-math-vmu', 'host.js'), 'utf8')
  const kit = readFileSync(join(REPO, 'vibe-math-vmu', 'kit', 'paper.js'), 'utf8')
  const quality = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper-quality.js'), 'utf8')
  ok(/const matchTitle = \(t\) => \{/.test(tools) && /if \(stateTarget !== '' && title\.endsWith\('\|' \+ stateTarget \+ '\|pdf'\)\) return 'target'/.test(tools) && /matchedBy: matchTitle\(ledger\.title\)/.test(tools),
    '§0 the compile ledger is matched by BOTH spellings of a paper’s name, and the receipt says which one hit (F3)')
  ok(/typeof paper\.compiledPdfRow === 'function' \? paper\.compiledPdfRow\(got\.state\)/.test(tools) && /compiledPdfRow: \(state\) => compiledPdfRow\(state\)/.test(readFileSync(join(REPO, 'vibe-math-vmu', 'kit', 'paper.js'), 'utf8')),
    '§0 …and it OPENS the candidate rows instead of parsing metadata-only `body` fields (run 21’s silent false)')
  ok(/lastRefusal: st\.lastRefusal === undefined \? null : st\.lastRefusal/.test(host) && /lastRefusalMeans/.test(host),
    '§0 the records status carries the LAST refusal, not only its count (F4)')
  ok(/const identifierLike = \(s\) =>/.test(quality) && /const hasIdentifier = identifierLike\(name\)/.test(quality) && /requiredLineIdentifier/.test(quality),
    '§0 the gate knows when a line carries an identifier (F2)')
  ok(/const claimPrefix = \(s\) =>/.test(quality) && /requiredLineTruncated/.test(quality),
    '§0 the gate knows when a name is a truncated prefix (F5)')
  ok(/const compiledPdfRow = \(state\) =>/.test(kit) && /const pdfLessFinal = state\.status === 'finalized'/.test(kit),
    '§0 a finalised paper with no PDF row is repairable (F1 rescue path)')
  ok(/const engineAbsent = String\(\(pdf && pdf\.code\) \|\| ''\) === 'VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING'/.test(kit) && /rolledBack: \{ from: 'finalized', to: state\.status/.test(kit),
    '§0 a compile that really failed rolls the finalisation BACK, while a missing LaTeX face is an environment gap (F1)')
  ok(/pdfEnvironmentMissing: true/.test(kit), '§0 …and the environment-gap finalisation says so in the receipt')
}

// ── §1 F3: the compile ledger is found by the title it was WRITTEN under, or by the id that addresses the paper ─────
{
  const root = await newRoot('pdf-ledger')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  // (a) a paper addressed by its minted id, whose PDF row is named after the HUMAN TARGET (what run 21 hit)
  const started = await A.call('vibe_v5_paper', { action: 'start', target: 'r176 human title', participants: ['r-acad', 'r-1'] })
  ok(started && started.ok === true, '§1a the paper starts', started && (started.code || started.id))
  const st0 = await A.call('vibe_v5_paper', { action: 'status', target: 'r176 human title' })
  const paper0 = st0 && st0.paper ? st0.paper : null
  ok(paper0 && typeof paper0.id === 'string' && String(paper0.id) !== '' && String(paper0.target) === 'r176 human title',
    '§1a the paper really has both names (id ≠ target)', paper0 && { id: paper0.id, target: paper0.target })
  pdfRow(A.kernel, 'v5r-paper|r176 human title|pdf', { pdfPath: 'D:/_tmp/r176/run21/a.pdf', pdfBytes: 4242, engine: 'xelatex', tried: [{ engine: 'xelatex', phase: 'compile', exitCode: 0 }] })
  const stA = await A.call('vibe_v5_paper', { action: 'status', target: String(paper0.id) })
  const pcA = stA && stA.pdfCompiled ? stA.pdfCompiled : null
  ok(pcA && pcA.produced === true && pcA.recordId !== null,
    '§1a ★★ addressing the paper by its ID finds the PDF row written under its TARGET (run 21 answered produced:false)',
    pcA && { produced: pcA.produced, recordId: pcA.recordId, matchedBy: pcA.matchedBy })
  ok(pcA && pcA.matchedBy === 'target', '§1a …and the receipt says WHICH spelling matched', pcA && pcA.matchedBy)
  // (b) the other spelling: a row named after the minted ID, addressed by the target
  const startedB = await A.call('vibe_v5_paper', { action: 'start', target: 'r176 second title', participants: ['r-acad', 'r-1'] })
  ok(startedB && startedB.ok === true, '§1b the second paper starts', startedB && (startedB.code || startedB.id))
  const stB0 = await A.call('vibe_v5_paper', { action: 'status', target: 'r176 second title' })
  const paperB = stB0 && stB0.paper ? stB0.paper : null
  ok(paperB && typeof paperB.id === 'string', '§1b the second paper has an id', paperB && paperB.id)
  pdfRow(A.kernel, 'v5r-paper|' + String(paperB.id) + '|pdf', { pdfPath: 'D:/_tmp/r176/run21/b.pdf', pdfBytes: 99, engine: 'xelatex' })
  const stB = await A.call('vibe_v5_paper', { action: 'status', target: 'r176 second title' })
  const pcB = stB && stB.pdfCompiled ? stB.pdfCompiled : null
  ok(pcB && pcB.produced === true && pcB.matchedBy === 'id',
    '§1b the ID-named row is found when the paper is addressed by its TARGET', pcB && { produced: pcB.produced, matchedBy: pcB.matchedBy })
  // (c) a paper that never compiled still says produced:false AND says what it looked for
  const startedC = await A.call('vibe_v5_paper', { action: 'start', target: 'r176 never compiled', participants: ['r-acad', 'r-1'] })
  ok(startedC && startedC.ok === true, '§1c the third paper starts', startedC && (startedC.code || startedC.id))
  const stC = await A.call('vibe_v5_paper', { action: 'status', target: 'r176 never compiled' })
  const pcC = stC && stC.pdfCompiled ? stC.pdfCompiled : null
  ok(pcC && pcC.produced === false && pcC.recordId === null && typeof pcC.means === 'string' && pcC.means.includes('paper-pdf'),
    '§1c a paper with no compile says so, and names the row it looked for', pcC && { produced: pcC.produced, means: String(pcC.means || '').slice(0, 60) })
}

// ── §2 F4: `records status` names the LAST refusal, not only how many there were ────────────────────────────────────
{
  const root = await newRoot('last-refusal')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  const before = await A.call('vibe_vmu_records', { action: 'status' })
  ok(before && before.refusalsTotal === 0 && before.lastRefusal === null,
    '§2 a clean kernel reports no refusal and no last refusal', before && { total: before.refusalsTotal, last: before.lastRefusal })
  const refused = await A.call('vibe_vmu_records', { action: 'list', track: 'not-a-track-anything-uses' })
  ok(refused && refused.ok === false && typeof refused.code === 'string',
    '§2 the refusal really happens', refused && refused.code)
  const after = await A.call('vibe_vmu_records', { action: 'status' })
  const rowAfter = after && after.records ? after.records : null
  const last = after && after.lastRefusal ? after.lastRefusal : null
  ok(after && after.refusalsTotal === 1, '§2 the count moves to 1', after && after.refusalsTotal)
  ok(last && typeof last.code === 'string' && last.code !== '',
    '§2 ★★ the status now NAMES the refusal that the count was counting (run 21 had 0→1→2 and no name)',
    last && { code: last.code, op: last.op })
  ok(last && String(last.code) === String(refused.code) && last.op === 'list',
    '§2 …with the same code and the op that was refused', last && { code: last.code, op: last.op, expected: refused.code })
  ok(after && typeof after.lastRefusalMeans === 'string' && after.lastRefusalMeans.length > 20,
    '§2 …and a means sentence explains what travels with the count', after && String(after.lastRefusalMeans || '').slice(0, 60))
  ok(rowAfter && typeof rowAfter.total === 'number' && rowAfter.total === 0,
    '§2 the row counts travel beside the refusal name in one receipt', rowAfter && rowAfter.total)
}

// ── §3 F2: a line carrying an identifier is asked for as PLAIN TEXT, never wrapped in `$…$` ─────────────────────────
{
  const root = await newRoot('identifier')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  const lit = 'Lean 4 core, Nat.add_comm'
  const card = await A.call('vibe_v5_record_proposition', {
    statement: 'n_plus_n_eq_two_n 这条恒等式成立', value: 1, motive: 'run 176 §3', p: 1, member: 'r-1', literature_ref: lit })
  ok(card && card.ok === true && typeof card.recordId === 'string', '§3 setup: the card is written', card && (card.code || card.recordId))
  const promoted = await A.call('vibe_v5_verified_promote', { card: card.recordId, warrant_kind: 'literature', literature_ref: lit, member: 'r-acad' })
  ok(promoted && promoted.ok === true && promoted.conclusion === true, '§3 setup: the card reaches the Verified track',
    promoted && (promoted.code || promoted.id))
  const name = String(card.title || '')
  ok(name.includes('n_plus_n_eq_two_n'), '§3 setup: the verified title really carries a Lean identifier', name)
  const started = await A.call('vibe_v5_paper', { action: 'start', target: 'r176 identifier paper', participants: ['r-acad', 'r-1'] })
  ok(started && started.ok === true, '§3 setup: the paper starts', started && (started.code || started.id))
  const part = await A.call('vibe_v5_paper', { action: 'part', target: 'r176 identifier paper', member: 'r-acad',
    part: 'the identifier line', solution: ('正文按 §3 讨论这一结论。') + String.fromCharCode(10) + '证据等级：draft', evidence: [String(card.recordId)] })
  ok(part && part.ok === true, '§3 setup: a part with real evidence is accepted', part && (part.code || part.ok))
  const st = await A.call('vibe_v5_paper', { action: 'status', target: 'r176 identifier paper' })
  const state = Object.assign({}, st.paper, { status: 'awaiting-editor' })
  const view = qualityMod.createRecordsView({ kernel: A.kernel, codes: qualityMod.QUALITY_CODES })
  const absent = qualityMod.checkQuality({ md: '正文一个结论都没有提。', state, view, codes: qualityMod.QUALITY_CODES })
  const miss = missingOf(absent)
  ok(absent && absent.ok === false && miss.length > 0, '§3 the omission is still refused', absent && { code: absent.code, missing: miss.length })
  ok(miss.length > 0 && miss[0].requiredLineIdentifier === true,
    '§3 ★★ the missing item says the line carries an IDENTIFIER', miss[0] && { id: miss[0].requiredLineIdentifier, truncated: miss[0].requiredLineTruncated })
  ok(miss.length > 0 && miss[0].requiredLineMath === null,
    '§3 ★★ …and does NOT hand over a `$…$` form of an identifier sentence (that is what asked for `! Double subscript.`)',
    miss[0] && miss[0].requiredLineMath)
  ok(String(absent && absent.hint || '').includes('纯文本') || String(absent && absent.hint || '').includes('不要包进'),
    '§3 …the hint says to write it as plain text', String(absent && absent.hint || '').slice(0, 90))
  const plain = qualityMod.checkQuality({ md: '正文提到 ' + name + ' 这一结论。', state, view, codes: qualityMod.QUALITY_CODES })
  ok(plain && plain.ok === true, '§3 the PLAIN-TEXT form satisfies the gate', plain && (plain.code || plain.ok))
  // The gate is a CONTENT check, not a syntax check: an identifier written inside `$…$` still counts as "the line is
  // present". What RUN 176 fixed is the RECOMMENDATION — the gate no longer hands that form over as the thing to paste.
  const mathForm = qualityMod.checkQuality({ md: '正文提到 $' + name + '$ 这一结论。', state, view, codes: qualityMod.QUALITY_CODES })
  ok(mathForm && mathForm.ok === true,
    '§3 the gate stays a content check (the math form still counts as present) — only the ADVICE changed',
    mathForm && { ok: mathForm.ok, missing: missingOf(mathForm).length })
}

// ── §4 F5: a truncated (48-char + `…`) name is matched by its PREFIX, never by the ellipsis ─────────────────────────
{
  const root = await newRoot('truncated')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  const lit = 'Euler, Introductio, p. 12'
  const long = '对于任意自然数n把它与自身相加所得之和恒等于二倍的这个自然数这是初等算术里最基础的一条恒等式可供后续论文直接引用'
  const card = await A.call('vibe_v5_record_proposition', {
    statement: long, value: 1, motive: 'run 176 §4', p: 1, member: 'r-1', literature_ref: lit })
  ok(card && card.ok === true && typeof card.recordId === 'string', '§4 setup: the long-claim card is written', card && (card.code || card.recordId))
  const promoted = await A.call('vibe_v5_verified_promote', { card: card.recordId, warrant_kind: 'literature', literature_ref: lit, member: 'r-acad' })
  ok(promoted && promoted.ok === true && promoted.conclusion === true, '§4 setup: the card reaches the Verified track',
    promoted && (promoted.code || promoted.id))
  const name = String(card.title || '')
  ok(name.endsWith('…') && name.length <= 49, '§4 setup: the row name is a TRUNCATED prefix', { name, len: name.length })
  const started = await A.call('vibe_v5_paper', { action: 'start', target: 'r176 truncated paper', participants: ['r-acad', 'r-1'] })
  ok(started && started.ok === true, '§4 setup: the paper starts', started && (started.code || started.id))
  const part = await A.call('vibe_v5_paper', { action: 'part', target: 'r176 truncated paper', member: 'r-acad',
    part: 'the truncated line', solution: ('正文按 §4 讨论这一结论。') + String.fromCharCode(10) + '证据等级：draft', evidence: [String(card.recordId)] })
  ok(part && part.ok === true, '§4 setup: a part with real evidence is accepted', part && (part.code || part.ok))
  const st = await A.call('vibe_v5_paper', { action: 'status', target: 'r176 truncated paper' })
  const state = Object.assign({}, st.paper, { status: 'awaiting-editor' })
  const view = qualityMod.createRecordsView({ kernel: A.kernel, codes: qualityMod.QUALITY_CODES })
  const prefix = name.slice(0, -1).trim()
  ok(prefix.length > 20, '§4 setup: the prefix the gate asks for is substantive', prefix.length)
  const byPrefix = qualityMod.checkQuality({ md: '正文提到 ' + prefix + ' 这一结论。', state, view, codes: qualityMod.QUALITY_CODES })
  ok(byPrefix && byPrefix.ok === true,
    '§4 ★★ writing the PREFIX (without the ellipsis) satisfies the gate (run 21 was asked to copy `…`)',
    byPrefix && (byPrefix.code || byPrefix.ok))
  const byVerifiedName = qualityMod.checkQuality({ md: '正文提到 ' + name + ' 这一结论。', state, view, codes: qualityMod.QUALITY_CODES })
  ok(byVerifiedName && byVerifiedName.ok === true, '§4 copying the shown name verbatim still satisfies the gate', byVerifiedName && (byVerifiedName.code || byVerifiedName.ok))
  const absent = qualityMod.checkQuality({ md: '正文一个结论都没有提。', state, view, codes: qualityMod.QUALITY_CODES })
  const miss = missingOf(absent)
  ok(absent && absent.ok === false && miss.length > 0 && miss[0].requiredLineTruncated === true,
    '§4 the missing item is marked as a TRUNCATED prefix (so a writer knows what is enough)',
    miss[0] && { truncated: miss[0].requiredLineTruncated })
  ok(String(absent && absent.hint || '').includes('前缀'),
    '§4 …and the hint says only the prefix is required', String(absent && absent.hint || '').slice(0, 90))
}

// ── §5 F1: a finalised paper with no PDF is repairable (the run-21 dead end) ───────────────────────────────────────
// The kit is driven directly here (the same shape `tests/vmu-run154-real-run4-fixes.test.mjs` uses) because the defect
// is in `recordFinal` itself: `finalized` was set BEFORE the compile ran, so a compile failure left a state that no
// later call could move. The rollback half of the fix is pinned in run 154 §6; this half pins the RESCUE.
{
  const rows = new Map()
  let seq = 0
  const settings = { 'vmu.records.tracks': ['paper'], 'vmu.paper.officeConsult': 'off' }
  const kernel = {
    settingsSnapshot: () => ({ ...settings }),
    members: { roster: () => [{ id: 'acad', slot: 'chair' }, { id: 'r-1', slot: 'member' }, { id: 'r-2', slot: 'member' }] },
    records: {
      put(r) {
        const id = r.id || ('row-' + (++seq))
        const prev = rows.get(id) || {}
        const row = Object.assign({}, prev, r, { id, rev: (prev.rev || 0) + 1, updatedAt: ++seq, fingerprint: 'fp-' + id + '-' + seq })
        rows.set(id, row)
        return { id, rev: row.rev, fingerprint: row.fingerprint }
      },
      get({ id }) { return { record: rows.get(id) || null } },
      list({ track, limit } = {}) {
        const items = [...rows.values()].filter((r) => !track || r.track === track)
        return { items: typeof limit === 'number' && limit > 0 ? items.slice(0, limit) : items }
      },
    },
  }
  const flow = pack.createPaperSubsystem({ kernel, clock: () => 1 })
  const T = 'r176 dead end'
  kernel.records.put({ id: 'rec-ev176', track: 'propositions', kind: 'proposition', title: '证据卡', body: '- statement：x' })
  flow.start({ target: T, participants: ['r-1', 'r-2'] })
  for (const m of ['r-1', 'r-2']) flow.recordPart({ target: T, member: m, title: m + ' 的标题', solution: (m + ' 的解法') + String.fromCharCode(10) + '证据等级：draft', evidence: ['Members/' + m + '/Propos/rec-ev176.md'] })
  flow.advance({ target: T })
  flow.recordReview({ target: T, member: 'r-1', deliverable: true, comments: '可交付' })
  flow.recordReview({ target: T, member: 'r-2', deliverable: true, comments: '可交付' })
  flow.advance({ target: T })
  const fin = await flow.recordFinal({ target: T, member: 'acad', decision: 'deliverable' })
  ok(fin && fin.finalized === true, '§5 setup: this assembly has no LaTeX FACE, so the paper finalises (environment gap, not a failed compile)',
    fin && { finalized: fin.finalized, pdfEnvironmentMissing: fin.pdfEnvironmentMissing })
  ok(fin && fin.pdfEnvironmentMissing === true,
    '§5 …and the receipt calls that gap by name instead of pretending a PDF exists', fin && fin.pdfEnvironmentMissing)
  const st1 = flow.state(T)
  ok(st1 && st1.state && st1.state.status === 'finalized', '§5 setup: the state really is finalised', st1 && st1.state && st1.state.status)
  const ledgerRows = [...rows.values()].filter((r) => String(r.kind) === 'paper-pdf' && String(r.title || '').includes(T))
  ok(ledgerRows.length === 0, '§5 setup: no `paper-pdf` row exists (this is exactly run 21’s paper-p17 shape)', ledgerRows.length)
  const revise = await flow.recordFinal({ target: T, member: 'acad', decision: 'revise', note: '把标识符改回纯文本重写正文' })
  ok(revise && revise.ok === true && revise.moved === true && revise.to === 'writing',
    '§5 ★★ a finalised paper with NO PDF row can be revised back into writing (run 21 could only start a new paper)',
    revise && { ok: revise.ok, moved: revise.moved, to: revise.to, code: revise.code })
  const st2 = flow.state(T)
  ok(st2 && st2.state && st2.state.status === 'writing', '§5 …and the state really moved to writing', st2 && st2.state && st2.state.status)
}

console.log('')
console.log('=== RUN 176 RUN 21 TRUTH: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('failures:')
  for (const f of failures) console.log('  - ' + f)
  process.exit(1)
}
