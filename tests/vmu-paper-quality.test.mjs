/**
 * tests/vmu-paper-quality.test.mjs — PHASE 12 / E1＋E3: the record-backed paper sections and the quality gate.
 *
 * WHAT THIS FILE PROVES (paired, with a real records double — no mock of the thing under test):
 *   E1-a  the three structurally-empty sections are DECLARED (indexes 1/3/4 → objective / verified / subproblems) and
 *         every one of them has a NAMED legal-empty sentence: an empty section is a stated fact, never a blank line;
 *   E1-b  with records present, the same three sections carry CONTENT READ FROM THE RECORDS FACE (the declared objective,
 *         the `verified` track's rows, the `problems` rows whose own card says p=1), with ids and provenance;
 *   E1-c  `sectionAudit` reports per-section mode/count so a caller can machine-check "filled vs legally empty";
 *   E3-a  a paper with free-text evidence and no record citations passes the gate (the gate refuses lies, not prose);
 *   E3-b  a citation path that names an id nobody recorded is REFUSED, and the message NAMES the id (no fabricated refs);
 *   E3-c  a part with no evidence at all is REFUSED (the appendix would promise evidence it does not have);
 *   E3-d  a body that drops a verified conclusion the records face holds is REFUSED, naming the row; and the same paper
 *         passes once the conclusion appears in the body (the pair is what makes ③ a gate rather than a keyword ban);
 *   E3-e  `qualityGate` returns the same verdict WITHOUT throwing (the editor may ask before committing).
 *
 * Run: node tests/vmu-paper-quality.test.mjs
 * Last line: === VMU PAPER QUALITY: N passed, M failed ===
 */
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = process.cwd()
let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('ok   ' + label); return true }
  failed += 1; console.log('FAIL ' + label); if (detail !== undefined) console.log('     ' + JSON.stringify(detail).slice(0, 600)); return false
}
/** Canonical text is compared, not object identity: `eq` must not read as an empty-vs-empty comparison. */
const canon = (v) => JSON.stringify(v)
const eq = (a, b, label) => ok(canon(a) === canon(b), label, { got: a, want: b })
const isEmptyCollection = (v) => (Array.isArray(v) ? v.length === 0 : (v !== null && typeof v === 'object' ? Object.keys(v).length === 0 : false))
/** Compare without pretending two empty collections differ (the pack's own helper convention). */
const eqLoose = (a, b, label) => ok(!(isEmptyCollection(a) && isEmptyCollection(b)) && JSON.stringify(a) === JSON.stringify(b), label, { got: a, want: b })

// ── the records double: the REAL contract subset the paper flow composes (put/get/list/status/supersede) ────────────────
// `get` returns the ROW (that is what kernel/records.js does and what packs/v5r/verified.js parses), `list` filters by
// track, `put` mints an id when none is given and computes a fingerprint — the gate's ② rule reads exactly that.
function makeKernel(settings = {}) {
  const rows = new Map()
  let seq = 0
  const kernel = {
    settingsSnapshot: () => ({ ...settings }),
    members: { roster: () => [{ id: 'acad', slot: 'chair' }, { id: 'office', slot: 'office' }, { id: 'r-1', slot: 'member' }, { id: 'r-2', slot: 'member' }] },
    latex: { check: async () => ({ ok: false, code: 'VMU_LATEX_NO_ENGINE', tried: [{ engine: 'xelatex', phase: 'probe', available: false }] }) },
    records: {
      put(row) {
        const id = row.id || ('row-' + (++seq))
        const fingerprint = 'fp-' + id + '-' + String(row.body || '').length
        const full = { ...row, id, fingerprint, updatedAt: 1 }
        rows.set(id, full)
        return { id, fingerprint, deduplicated: false }
      },
      get({ id }) { return rows.get(id) || null },
      list({ track, limit } = {}) {
        const items = [...rows.values()].filter((r) => !track || r.track === track).map((r) => ({ id: r.id, track: r.track, kind: r.kind, title: r.title }))
        return { items: typeof limit === 'number' && limit > 0 ? items.slice(0, limit) : items, count: items.length, truncated: false }
      },
      supersede({ id, body, by = null }) {
        const prev = rows.get(id)
        if (!prev) throw Object.assign(new Error('no row ' + id), { code: 'VMU_NO_SUCH_OBJECT' })
        rows.set(id, { ...prev, body, by, updatedAt: 2, fingerprint: 'fp2-' + id })
        return { ok: true, id, adopted: 2, fingerprint: 'fp2-' + id }
      },
      status: () => ({ caps: { bodyCapBytes: 200000 } }),
    },
  }
  return { kernel, rows }
}

const paperMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper.js')).href)
const qMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper-quality.js')).href)
const vMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'verified.js')).href)

/** Put a v5r proposition card into the double with an EXPLICIT id (citations index by record id). */
function seedCard(records, { id, p = 1, title = '引理 A 的命题', statement = '引理 A 对一切自然数 n 成立' }) {
  const body = vMod.composeCardBody({ id, statement, value: '主引理', motive: '最终论文的核心', p, title })
  records.put({ id, track: 'propositions', kind: 'proposition', title, body, settled: p === 1 || p === 0 })
  return id
}
/** Put a `problems` row (subproblem) whose own card says p=1. */
function seedSubproblem(records, { id, p = 1, title = '子问题一：n=1 的情形' }) {
  const body = '- statement：' + title + '\n- value：1\n- motive：主引理的起点\n- p：' + p
  records.put({ id, track: 'problems', kind: 'subproblem', title, body })
  return id
}
const headingMark = (md, heading) => '\n## ' + heading

/** The text under one heading, up to the next '## ' (used to prove "not a silent blank line"). */
function sectionText(md, heading) {
  const at = md.indexOf(headingMark(md, heading))
  if (at < 0) return null
  const rest = md.slice(at + headingMark(md, heading).length)
  const next = rest.indexOf('\n## ')
  return (next < 0 ? rest : rest.slice(0, next)).trim()
}

/** Drive a paper to `awaiting-editor` with one part per participant (the state the editor finalises from). */
async function toEditor(paper, { target, parts }) {
  paper.start({ target, participants: ['r-1', 'r-2'] })
  for (const part of parts) paper.recordPart({ target, ...part })
  paper.advance({ target })
  paper.recordReview({ target, member: 'r-1', deliverable: true })
  paper.recordReview({ target, member: 'r-2', deliverable: true })
  paper.advance({ target })
}

const QUALITY_CODES = qMod.QUALITY_CODES
const QUALITY_CODE_SET = Object.freeze(Object.values(QUALITY_CODES))

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 1. THE DECLARATION: which sections are record-backed, and what may legally be empty ===')
{
  ok(Array.isArray(qMod.RECORD_SECTIONS) && Object.isFrozen(qMod.RECORD_SECTIONS), 'record sections: the declaration is a frozen array (a runtime that mutates it would change policy silently)')
  eq(qMod.RECORD_SECTIONS.map((s) => s.index), [1, 3, 4], 'record sections: exactly the three indexes the outline leaves without a part-field (1 引言 / 3 已检验通过的命题 / 4 已解决的子问题)')
  eq(qMod.RECORD_SECTIONS.map((s) => s.source), ['objective', 'verified', 'subproblems'], 'record sections: 1 ← the declared objective, 3 ← the verified track, 4 ← the problems track (no new track is invented)')
  ok(qMod.RECORD_SECTIONS.length === 3, 'the record-backed sections are exactly the three that `sectionFields` left blank (1/3/4) — the loop below is over a NON-EMPTY, pinned set')
  ok(qMod.RECORD_SECTIONS.every((s) => typeof s.legalEmpty === 'string' && s.legalEmpty.trim().length > 20), 'record sections: every legal empty state carries a NAMED sentence (empty is a fact with a reason, never a blank line)')
  eq(Object.keys(QUALITY_CODES).sort(), ['CITATION_UNKNOWN', 'EVIDENCE_MISSING', 'SECTIONS', 'VERIFIED_MISSING'], 'quality codes: the four refusals exist (sections can\'t be filled / unknown citation / no evidence / a record conclusion dropped from the body)')
  const codesV = Object.values(QUALITY_CODES)
  ok(codesV.length === 4 && codesV.every((c) => c.startsWith('VMU_PACK_V5R_')), 'quality codes: all four are VMU_PACK_ codes — the pack family that registers by prefix (`tests/audit-vmu-docs` exempts them from the kernel table)')
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 2. E1 with an EMPTY institute: the three sections are NAMED-empty, never silently blank ===')
{
  const { kernel } = makeKernel({ 'vmu.records.tracks': ['paper', 'propositions', 'problems', 'verified', 'progress', 'methods'] })
  const paper = paperMod.createPaperSubsystem({ kernel, clock: () => 1 })
  paper.start({ target: '空库论文', participants: ['r-1'] })
  const md = paper.PaperMd({ target: '空库论文' })
  ok(qMod.RECORD_SECTIONS.length === 3, 'the loop below iterates the three record-backed sections (pinned size, so its assertions always run)')
  for (const entry of qMod.RECORD_SECTIONS) {
    const heading = paperMod.PAPER_SECTIONS[entry.index]
    const body = sectionText(md, heading)
    ok(typeof body === 'string' && body.length > 0, 'E1 empty: 「' + heading + '」 has text under it (not a silent blank line)', body)
    ok(typeof body === 'string' && body.includes('合法的'), 'E1 empty: 「' + heading + '」 says the emptiness is LEGAL and why', body)
  }
  const audit = paper.sectionAudit({ target: '空库论文' })
  ok(audit.ok === true, 'E1 empty: sectionAudit found all three headings (ok:true)')
  eq(audit.sections.map((s) => s.mode), ['legal-empty', 'legal-empty', 'legal-empty'], 'E1 empty: every record-backed section is reported as legal-empty')
  eq(audit.sections.map((s) => s.count), [0, 0, 0], 'E1 empty: the counts are measured (0), not inferred')
  eq(Array.isArray(audit.problems) ? audit.problems.length : -1, 0, 'E1 empty: no "heading not found" problem — the renderer and the policy agree on the headings')
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 3. E1 with a populated institute: the three sections carry RECORD content ===')
{
  const { kernel } = makeKernel({ 'vmu.turn.objective': '证明引理 A 对一切自然数 n 成立，并给出 A 的两个推论', 'vmu.records.tracks': ['paper', 'propositions', 'problems', 'verified', 'progress', 'methods'] })
  const records = kernel.records
  const cardId = seedCard(records, { id: 'p-1' })
  const promoted = vMod.promoteVerified({ records, sourceId: cardId, warrant: { id: 'w-1', kind: 'debate-unanimous', subject: cardId }, at: 1000, by: 'chair' })
  ok(promoted.ok === true && promoted.written === true, 'E1 populated: the verified track holds ONE row (promoted from a p=1 card with its warrant)', promoted)
  seedSubproblem(records, { id: 'sub-1', p: 1, title: '子问题一：n=1 的情形' })
  seedSubproblem(records, { id: 'sub-2', p: 0.4, title: '子问题二：还没判定' })

  const paper = paperMod.createPaperSubsystem({ kernel, clock: () => 1 })
  paper.start({ target: '有库论文', participants: ['r-1'] })
  const md = paper.PaperMd({ target: '有库论文' })

  const objective = sectionText(md, paperMod.PAPER_SECTIONS[1])
  ok(typeof objective === 'string' && objective.includes('引理 A 对一切自然数 n 成立'), 'E1 §1: 引言与问题背景 carries the DECLARED objective read from the settings snapshot', objective)
  ok(typeof objective === 'string' && objective.includes('vmu.turn.objective'), 'E1 §1: it also names WHERE the text came from (so a reader can check the declaration)', objective)

  const verified = sectionText(md, paperMod.PAPER_SECTIONS[3])
  ok(typeof verified === 'string' && verified.includes('引理 A 的命题'), 'E1 §3: 已检验通过的命题 lists the verified row by title', verified)
  ok(typeof verified === 'string' && verified.includes('（命题卡 `' + cardId + '`）'), 'E1 §3: it names the CARD id (`' + cardId + '`) — the same id a citation path must use', verified)
  ok(typeof verified === 'string' && verified.includes('w-1'), 'E1 §3: it carries the WARRANT id, so "verified" is never an unsourced claim', verified)

  const sub = sectionText(md, paperMod.PAPER_SECTIONS[4])
  ok(typeof sub === 'string' && sub.includes('子问题一'), 'E1 §4: 已解决的子问题 lists the p=1 subproblem', sub)
  ok(typeof sub === 'string' && sub.includes('sub-1'), 'E1 §4: it names the record id', sub)
  ok(typeof sub === 'string' && !sub.includes('子问题二'), 'E1 §4: a p=0.4 subproblem is NOT listed as solved (the card\'s own boolean is the criterion)', sub)

  const audit = paper.sectionAudit({ target: '有库论文' })
  eq(audit.sections.map((s) => s.mode), ['filled', 'filled', 'filled'], 'E1 populated: all three sections report mode filled')
  eq(audit.sections.map((s) => s.count), [1, 1, 1], 'E1 populated: the counts are measured (1 objective / 1 verified / 1 solved subproblem)')
  ok(audit.sections.length > 0, 'the section audit returned rows (the loop below cannot pass vacuously)')
  ok(audit.sections.length === qMod.RECORD_SECTIONS.length && audit.sections.every((s) => s.chars > 0), 'E1 populated: every filled section reports its measured char count')

  // ── E1-d THE SEAM REACHES THE ARTEFACT: `render`/`PaperTex`/`PaperArtifacts` build from the KIT's own closure, so before
  // the `mdFill` option existed the .md/.tex written to `Paper/` were the UNFILLED outline while only the tool receipt was
  // filled. These assertions pin the fix from both sides: the artefact BUILDERS carry the fill, and the raw base does not —
  // the second half is what proves the content comes from the seam rather than from the kit learning about records.
  const tex = paper.PaperTex({ target: '有库论文' })
  ok(typeof tex === 'string' && tex.includes('引理 A 的命题'), 'E1-d: the .tex artefact carries the §3 fill (PaperTex is built from the same seam, not from a second renderer)', tex && tex.slice(0, 120))
  const raw = paper.PaperMdRaw({ target: '有库论文' })
  ok(typeof raw === 'string' && !raw.includes('引理 A 的命题'), 'E1-d: the UNFILLED base does NOT carry it — so the text provably arrives through `mdFill`, and §3-rule-③ keeps judging authors, not the fill', raw && raw.slice(0, 120))
  ok(typeof raw === 'string' && raw.includes('## ' + paperMod.PAPER_SECTIONS[3]), 'E1-d: the raw base still has the §3 heading (the fill inserts content, it does not invent a section)', raw && raw.slice(0, 120))
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 4. E3-a: a paper with free-text evidence and no record citations PASSES the quality gate ===')
{
  const { kernel } = makeKernel({ 'vmu.records.tracks': ['paper', 'propositions', 'problems', 'verified', 'progress', 'methods'] })
  const paper = paperMod.createPaperSubsystem({ kernel, clock: () => 1 })
  await toEditor(paper, { target: '合格论文', parts: [
    { member: 'r-1', title: '引理 A 的证明骨架', solution: '把 A 拆成两个引理', evidence: ['r-1 的命题卡'] },
    { member: 'r-2', title: '审阅要点', methods: '反证法', evidence: ['r-2 的笔记'] },
  ] })
  const verdict = paper.qualityGate({ target: '合格论文' })
  ok(verdict.ok === true, 'E3-a: the gate passes a paper whose prose carries no record-path citations (the gate refuses lies, not free text)', verdict)
  ok(verdict.counts && verdict.counts.evidence === 2, 'E3-a: both evidence entries are counted', verdict.counts)
  let thrown = null
  try { paper.render({ target: '合格论文' }) } catch (e) { thrown = e }
  // The quality gate let it through: either the paper finalises (the consult gate is not armed in this double) or the
  // NEXT gate in line refuses (E4's consult). What must never happen is one of the four QUALITY codes.
  ok(thrown === null, 'E3-a: render produced the artefacts without a QUALITY refusal (the gate let a compliant paper through)', thrown && thrown.code)
  ok(!thrown && QUALITY_CODE_SET.length === 4 && QUALITY_CODE_SET.every((c) => Object.values(qMod.QUALITY_CODES).includes(c)), 'E3-a: none of the four quality codes fired on a compliant paper')
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 5. E3-b: a citation that names an unrecorded id is REFUSED, and the id is NAMED ===')
{
  const { kernel } = makeKernel({ 'vmu.records.tracks': ['paper', 'propositions', 'problems', 'verified', 'progress', 'methods'] })
  seedCard(kernel.records, { id: 'p-1' })
  const paper = paperMod.createPaperSubsystem({ kernel, clock: () => 1 })
  await toEditor(paper, { target: '编造引用', parts: [
    { member: 'r-1', title: '骨架', solution: '见先前的推导', evidence: ['Members/r-1/Propos/p-404.md'] },
  ] })
  const verdict = paper.qualityGate({ target: '编造引用' })
  ok(verdict.ok === false && verdict.code === QUALITY_CODES.CITATION_UNKNOWN, 'E3-b: the gate refuses a citation whose id is not in the records face', verdict)
  ok(verdict.message.includes('p-404'), 'E3-b: the message NAMES the offending id (and the member) — no vague "invalid reference"', verdict.message)
  ok(Array.isArray(verdict.missing) && verdict.missing[0] && verdict.missing[0].id === 'p-404' && verdict.missing[0].expectedTrack === 'propositions',
    'E3-b: the verdict carries machine-readable detail (id + the track the path claims)', verdict.missing)
  let thrown = null
  try { paper.render({ target: '编造引用' }) } catch (e) { thrown = e }
  ok(thrown && thrown.code === QUALITY_CODES.CITATION_UNKNOWN, 'E3-b: render REFUSES to produce the artefacts with that code (the gate runs before the delegate writes anything)', thrown && thrown.code)
  ok(thrown && Array.isArray(thrown.missing) && thrown.missing.length === 1, 'E3-b: the thrown refusal keeps the machine-readable `missing` list (a caller can name every bad citation)', thrown && thrown.missing)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 6. E3-c: a paper with NO evidence at all is REFUSED (the appendix cannot promise what it lacks) ===')
{
  const { kernel } = makeKernel({ 'vmu.records.tracks': ['paper', 'propositions', 'problems', 'verified', 'progress', 'methods'] })
  const paper = paperMod.createPaperSubsystem({ kernel, clock: () => 1 })
  await toEditor(paper, { target: '无证据', parts: [
    { member: 'r-1', title: '只有正文', solution: '我们做了点什么' },
    { member: 'r-2', title: '审阅', methods: '没什么可引' },
  ] })
  const verdict = paper.qualityGate({ target: '无证据' })
  ok(verdict.ok === false && verdict.code === QUALITY_CODES.EVIDENCE_MISSING, 'E3-c: the gate refuses a paper whose parts carry no evidence entries', verdict)
  ok(verdict.message.includes('证据') && verdict.members.length === 2, 'E3-c: the message says what is missing and counts the members whose evidence lists are empty', verdict)
  let thrown = null
  try { paper.render({ target: '无证据' }) } catch (e) { thrown = e }
  ok(thrown && thrown.code === QUALITY_CODES.EVIDENCE_MISSING, 'E3-c: render refuses with that code', thrown && thrown.code)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 7. E3-d: dropping a verified conclusion from the body is REFUSED; naming it PASSES (the pair) ===')
{
  // ── 7a the body does NOT mention the verified row ─────────────────────────────────────────────────────────────────────
  {
    const { kernel } = makeKernel({ 'vmu.records.tracks': ['paper', 'propositions', 'problems', 'verified', 'progress', 'methods'] })
    const cardId = seedCard(kernel.records, { id: 'p-7', title: '引理 B 的命题' })
    vMod.promoteVerified({ records: kernel.records, sourceId: cardId, warrant: { id: 'w-7', kind: 'debate-unanimous', subject: cardId }, at: 1, by: 'chair' })
    const paper = paperMod.createPaperSubsystem({ kernel, clock: () => 1 })
    await toEditor(paper, { target: '漏结论', parts: [
      { member: 'r-1', title: '骨架', solution: '只写了别的推导', evidence: ['Members/r-1/Propos/p-7.md'] },
    ] })
    const verdict = paper.qualityGate({ target: '漏结论' })
    ok(verdict.ok === false && verdict.code === QUALITY_CODES.VERIFIED_MISSING, 'E3-d: the gate refuses a body that omits a verified conclusion the records face holds', verdict)
    ok(verdict.message.includes('p-7'), 'E3-d: the message names the missing conclusion', verdict.message)
    ok(Array.isArray(verdict.missing) && verdict.missing[0].kind === 'verified' && verdict.missing[0].cardId === 'p-7', 'E3-d: the detail names the CARD id and the kind', verdict.missing)
    let thrown = null
    try { paper.render({ target: '漏结论' }) } catch (e) { thrown = e }
    ok(thrown && thrown.code === QUALITY_CODES.VERIFIED_MISSING, 'E3-d: render refuses with that code', thrown && thrown.code)
  }
  // ── 7b the SAME paper, with the conclusion named in the body ─────────────────────────────────────────────────────────
  {
    const { kernel } = makeKernel({ 'vmu.records.tracks': ['paper', 'propositions', 'problems', 'verified', 'progress', 'methods'] })
    const cardId = seedCard(kernel.records, { id: 'p-7', title: '引理 B 的命题' })
    vMod.promoteVerified({ records: kernel.records, sourceId: cardId, warrant: { id: 'w-7', kind: 'debate-unanimous', subject: cardId }, at: 1, by: 'chair' })
    const paper = paperMod.createPaperSubsystem({ kernel, clock: () => 1 })
    await toEditor(paper, { target: '含结论', parts: [
      { member: 'r-1', title: '骨架', solution: '已检验通过的命题「引理 B 的命题」是本文的核心', evidence: ['Members/r-1/Propos/p-7.md'] },
    ] })
    const verdict = paper.qualityGate({ target: '含结论' })
    ok(verdict.ok === true, 'E3-d: the SAME paper passes once the body names the verified conclusion (the gate is about presence, not wording)', verdict)
    ok(verdict.counts.verified === 1 && verdict.counts.citations === 1, 'E3-d: it counted 1 verified row and 1 resolved citation', verdict.counts)
    let thrown = null
    try { paper.render({ target: '含结论' }) } catch (e) { thrown = e }
    ok(thrown === null, 'E3-d: the same paper renders without a QUALITY refusal (presence is the whole rule)', thrown && thrown.code)
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 8. E3-e: qualityGate never throws — the verdict is data ===')
{
  const { kernel } = makeKernel({ 'vmu.records.tracks': ['paper', 'propositions', 'problems', 'verified', 'progress', 'methods'] })
  const paper = paperMod.createPaperSubsystem({ kernel, clock: () => 1 })
  paper.start({ target: '还没正文', participants: ['r-1'] })
  const verdict = paper.qualityGate({ target: '还没正文' })
  ok(verdict.ok === true && verdict.skipped === 'no-parts', 'E3-e: with no parts there is no written text to judge, and the gate SAYS it skipped (no-parts) instead of pretending it checked', verdict)
  const filled = paper.PaperMd({ target: '还没正文' })
  ok(typeof filled === 'string' && filled.includes(paperMod.PAPER_SECTIONS[3]), 'E3-e: rendering still works on a writing-stage paper (the fill is independent of the gate)')
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 9. the draft boundary: a paper still being written renders WITHOUT the delivery checks, and says so ===')
{
  const { kernel } = makeKernel({ 'vmu.records.tracks': ['paper', 'propositions', 'problems', 'verified', 'progress', 'methods'] })
  const paper = paperMod.createPaperSubsystem({ kernel, clock: () => 1 })
  paper.start({ target: '草稿论文', participants: ['r-1'] })
  paper.recordPart({ target: '草稿论文', member: 'r-1', title: '还没证据的草稿', solution: '初稿' })
  const verdict = paper.qualityGate({ target: '草稿论文' })
  ok(verdict.ok === true && verdict.skipped === 'draft:writing', 'the gate SKIPS a draft and names why (draft:writing) — the three delivery rules are enforced from awaiting-editor onwards', verdict)
  let thrown = null
  try { paper.render({ target: '草稿论文' }) } catch (e) { thrown = e }
  ok(thrown === null, 'a draft renders for inspection (the flow exists to iterate; the gate guards the deliverable, not the draft)', thrown && thrown.code)
}

console.log('')
console.log('=== VMU PAPER QUALITY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)
