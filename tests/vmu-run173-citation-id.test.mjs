// tests/vmu-run173-citation-id.test.mjs — RUN 173 (real machine, run 18 / FEEDBACK18-precursor).
//
// THE DEFECT THIS PINS (measured on the real machine, run 18, build ffab44d1):
//   The citation gate was fixed in RUN 172 to see every pointer on a line — and the very first fresh run then produced a
//   FALSE ACCUSATION. A member wrote a pointer inside a sentence and followed it with his own Chinese punctuation:
//     `…见 Members/r-1/Propos/rec-316.md（RUN14 复核过的偶数和卡）…`
//   The capture group was `[^\/\\\s]+?`, which stops only at whitespace or a closing bracket, so the id it read was
//   `rec-316.md（RUN14` — and the gate answered `no record with this id` about a record that EXISTS (`rec-316` on the
//   propositions track). A gate that accuses a true citation is worse than one that misses it: the institute is told its
//   own correct work is fabricated.
//
// WHAT RUN 173 CHANGED (one rule, three places, so the two gates cannot disagree again):
//   · `MEMBER_FILE` captures exactly the id alphabet `[A-Za-z0-9_.-]` and ends the match at the first NON-id character
//     (an optional `#anchor` is kept in the matched TEXT for the receipt, but is never part of the id);
//   · `normalizeCitedId` (a pointer quoted in prose) cuts at the first non-id character — prose punctuation after a path
//     is prose, not addressing;
//   · `normalizeBareId` (a bare citation: an `evidence` entry, or a pointer-less id) does NOT cut, because there is no
//     path around it to tell us where the id ends: the WHOLE string must be an id, or the entry is free text and the gate
//     must not accuse it (`r-1 的命题卡` is a sentence, not the record `r-1`).
//
// RULE E: every collection assertion states its non-emptiness (or exact shape) in the same expression.
import { mkdtemp, mkdir } from 'node:fs/promises'
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

const entry = await import(pathToFileURL(ENTRY).href)
const qualityMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper-quality.js')).href)
const BASE = 'D:/_tmp/r173/citation-id'
const newRoot = async (tag) => { await mkdir(BASE, { recursive: true }); return mkdtemp(join(BASE, tag + '-')) }
let tick = 1000
const boot = async (root) => {
  const specs = []
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { root, packs: ['v5r'], clock: () => tick })
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
const missingOf = (v) => (v && Array.isArray(v.missing) ? v.missing : [])

// ── §0 the source says what this pins ───────────────────────────────────────────────────────────────────────────────
{
  const quality = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper-quality.js'), 'utf8')
  ok(quality.includes('([A-Za-z0-9_.-]+?)(?:\\.md)?') && quality.includes('(?=$|[^A-Za-z0-9_.-])') && quality.includes('(?:#[^\\s，。；、）)\\]（]*)'),
    '§0 the pointer capture is the ID ALPHABET and the match ends at the first non-id character (run 18 read `rec-316.md（RUN14` as an id)')
  ok(quality.includes("head.replace(/[^A-Za-z0-9_.-].*$/, '')"),
    "§0 a pointer quoted in prose cuts at the member's own punctuation before the id is resolved")
  ok(/const normalizeBareId = \(raw\) => \{/.test(quality) && /const isBareCitation = \(id\) =>/.test(quality),
    '§0 a BARE citation has its own normalizer (the whole string must be an id)')
  ok(/const bare = normalizeBareId\(c\.text\)/.test(quality) && /const bare = normalizeBareId\(barePointer\)/.test(quality),
    '§0 …and both bare branches use it (the prose gate and the evidence fail-fast gate)')
}

// ── §1 a TRUE pointer followed by Chinese punctuation is not a fabrication ───────────────────────────────────────────
{
  const root = await newRoot('true-pointer')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  const card = A.kernel.records.put({ track: 'propositions', kind: 'proposition', title: 'even sum card', body: '对任意自然数 n，2+4+…+2n = n(n+1)' })
  ok(!!card && !!card.id, '§1 the cited card is on the propositions track', card && card.id)
  await A.call('vibe_v5_paper', { action: 'start', target: 'p1', participants: ['r-acad', 'r-1'] })
  const solution = '可寻址的一处：Members/r-1/Propos/' + card.id + '.md（RUN14 复核过的偶数和卡）是对的。'
  const part = await A.call('vibe_v5_paper', { action: 'part', target: 'p1', member: 'r-acad', part: 'true pointer then punctuation', solution, evidence: [String(card.id)] })
  ok(part.ok === true, '§1 the part is accepted', part.code)
  const verdict = await qualityOf(A, 'p1')
  const missing = missingOf(verdict)
  ok(verdict && verdict.ok === true,
    '§1 ★★ a TRUE citation followed by the member\'s own `（…` is NOT accused (run 18: `no record with this id` about rec-316)', { code: verdict && verdict.code, missing })
  ok(!missing.some((m) => String(m.id || '').includes('（') || String(m.path || '').includes('（')),
    '§1 …and no reported id/path carries prose punctuation', missing.map((m) => m.id))
}

// ── §2 a FABRICATED pointer is still refused, with a clean id and its anchor kept in the path ───────────────────────
{
  const root = await newRoot('false-pointer')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  const card = A.kernel.records.put({ track: 'propositions', kind: 'proposition', title: 'even sum card', body: '对任意自然数 n，1+3+…+(2n−1) = n²' })
  await A.call('vibe_v5_paper', { action: 'start', target: 'p2', participants: ['r-acad', 'r-1'] })
  const solution = '可寻址的一处：Members/r-1/Propos/' + card.id + '.md#命题陈述；不可寻址的一处：Members/r-1/Propos/run18-not-a-record.md#§3（这是编的）。'
  const part = await A.call('vibe_v5_paper', { action: 'part', target: 'p2', member: 'r-acad', part: 'false pointer then punctuation', solution, evidence: [String(card.id)] })
  ok(part.ok === true, '§2 the part is accepted (the write gate checks `evidence`, not the prose)', part.code)
  const verdict = await qualityOf(A, 'p2')
  const missing = missingOf(verdict)
  ok(verdict && verdict.ok === false && verdict.code === qualityMod.QUALITY_CODES.CITATION_UNKNOWN,
    '§2 ★★ the fabricated pointer is still refused', { ok: verdict && verdict.ok, code: verdict && verdict.code })
  ok(missing.length === 1 && missing[0].id === 'run18-not-a-record',
    '§2 …the reported id is the RECORD ID, not the id plus the member\'s punctuation', missing.map((m) => m.id))
  ok(missing.length === 1 && String(missing[0].path).includes('#§3') && !String(missing[0].path).includes('（'),
    '§2 …the path keeps the `#anchor` and stops at the prose', missing.map((m) => m.path))
}

// ── §3 free text is free text: the gate refuses lies, not sentences ─────────────────────────────────────────────────
{
  const root = await newRoot('free-text')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  const card = A.kernel.records.put({ track: 'propositions', kind: 'proposition', title: 'a card', body: '命题：1+1=2' })
  await A.call('vibe_v5_paper', { action: 'start', target: 'p3', participants: ['r-acad', 'r-1'] })
  // The write gate on `part` refuses evidence it cannot resolve, which is the point of that gate; what THIS section pins
  // is the QUALITY gate reading a part row that already exists (a member may have written it through another path). The
  // row is written directly, the way recordPart would shape it.
  const partRow = A.kernel.records.put({ track: 'paper', kind: 'paper-part', title: 'v5r-paper|p3|part|r-acad', by: 'r-acad',
    body: JSON.stringify({ title: 'free text evidence', solution: '正文引用：Members/r-1/Propos/' + card.id + '.md。', evidence: ['r-1 的命题卡', '上面那一节的直观说明'] }) })
  ok(!!partRow && !!partRow.id, '§3 the part row is on disk with free-text evidence', partRow && partRow.id)
  const st = await A.call('vibe_v5_paper', { action: 'status', target: 'p3' })
  const view = qualityMod.createRecordsView({ kernel: A.kernel, codes: qualityMod.QUALITY_CODES })
  const state = { target: 'p3', round: 1, status: 'awaiting-editor', participants: ['r-acad', 'r-1'], parts: { 'r-acad': { recordId: partRow.id, round: 1 } } }
  void st
  const verdict = qualityMod.checkQuality({ md: '', state, view, codes: qualityMod.QUALITY_CODES })
  const missing = missingOf(verdict)
  ok(verdict && verdict.ok === true,
    '§3 ★★ free-text evidence is not accused (the bare normalizer refuses to cut `r-1 的命题卡` into `r-1`)', { code: verdict && verdict.code, missing })
  ok(!missing.some((m) => String(m.id || '').startsWith('r-1')),
    '§3 …and no bare sentence fragment is reported as a record id', missing.map((m) => m.id))
}

// ── §4 a bare citation (id with an optional .md/anchor) still resolves — and a bare id that does not exist is named ──
{
  const root = await newRoot('bare')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  const card = A.kernel.records.put({ track: 'propositions', kind: 'proposition', title: 'bare ok', body: '命题：2+2=4' })
  const codes = qualityMod.QUALITY_CODES
  const view = qualityMod.createRecordsView({ kernel: A.kernel, codes })
  const good = qualityMod.checkEvidencePointers({ evidence: [String(card.id) + '.md#命题陈述'], records: A.kernel.records, codes })
  ok(good && good.ok === true && good.resolved.length === 1 && good.resolved[0].cardId === card.id,
    '§4 a bare `id.md#anchor` evidence pointer resolves', { ok: good && good.ok, resolved: good && good.resolved })
  const bad = qualityMod.checkEvidencePointers({ evidence: ['rec-173-nosuch.md'], records: A.kernel.records, codes })
  ok(bad && bad.ok === false && bad.unknown.length === 1 && bad.unknown[0].cardId === 'rec-173-nosuch' && bad.unknown[0].reason === 'no-such-record',
    '§4 …a bare id nobody recorded is `no-such-record` (not `not-a-member-file-pointer`)', { ok: bad && bad.ok, unknown: bad && bad.unknown })
  ok(!!view, '§4 the records view composes with the same kernel')
}

console.log('\n=== VMU RUN 173 CITATION ID: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { for (const f of failures) console.error('FAIL ' + f); process.exit(1) }
