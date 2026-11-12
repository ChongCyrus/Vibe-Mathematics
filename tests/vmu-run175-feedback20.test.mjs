// tests/vmu-run175-feedback20.test.mjs — RUN 175 (real machine, run 20 / FEEDBACK20 REALM-INSPECTION).
//
// THE DEFECTS THIS PINS (measured on the real machine, run 20, build d9b83349):
//   ⑨ A CARD'S NAME WAS ITS OWN PROBABILITY: `vibe_v5_record_proposition` with no `title` named the row
//        `proposition 0.6`, that name travelled into the Verified row (`已验证｜proposition 0.6`) and from there into the
//        paper prose through the `requiredLine` gate — a name that stops being true the moment a ruling settles p.
//   ⑩ THE CLOSURE VOTES WERE UNREADABLE ON THE MEETING BOARD: `vibe_v5_meeting {action:"summary"}` answered
//        `votes:0, votesSource:"none-recorded-on-this-face"` while `vibe_vmu_status {detail:"closure"}` read 3.
//   ④ `records {action:"list"}` said `truncated:true` with a hint naming two POSSIBLE families, so a reader holding
//        `total:66, returned:7` could not tell whether their `limit` or `vmu.records.headListAt` had cut the page.
//   ⑦ `start` (editor omitted) did not say which finaliser the paper got, nor that the value was a DEFAULT.
//   ⑤ a paper view carried `parts[].round`, `reviews[].round` and `consult.requests[].at` with nothing saying which
//        was an ordinal and which a wall clock.
//   ⑬ `records.status.refusalsTotal:1` counted a refusal nobody could trace.
//   ① a pointer quoted inside markdown inline code was reported WITH the closing tick.
//   ② a verified title carrying math forced the escaped form into the prose (`Σ\_\{k=1\}\textasciicircum{}\{n\}`).
//
// WHAT RUN 175 CHANGED:
//   · `kit/handlers.js#titleOfCard`: title = explicit title || id || the CLAIM (statement/content, 48 chars) — never p;
//     the card receipt names `title` + `titleMeans`.
//   · `tools/meeting.js`: `summary` carries `closureTally {face, detail, votesCast, cast, confirmed, missing}` + means.
//   · `host.js` records list: `truncatedBy[]` names the ceiling that bit, with the numbers it used.
//   · `kit/paper.js#start`: `editor {value, source, means}`.
//   · `packs/v5r/tools.js`: `paper status` carries `roundMeans`; `pdfCompiled` names the compile ledger.
//   · `kernel/records.js`: `status().lastRefusal {code, at, op, message}` + means.
//   · `packs/v5r/paper-quality.js`: `pointerText` strips the markdown wrapper; the verified-line comparison normalizes
//     math on BOTH sides (`$…$` accepted), and a missing one carries `requiredLineMath`.
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
const BASE = __tmpRoot() + '/r175/feedback20'
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

// ── §0 the source says what this pins ───────────────────────────────────────────────────────────────────────────────
{
  const handlers = readFileSync(join(REPO, 'vibe-math-vmu', 'kit', 'handlers.js'), 'utf8')
  const meeting = readFileSync(join(REPO, 'vibe-math-vmu', 'tools', 'meeting.js'), 'utf8')
  const host = readFileSync(join(REPO, 'vibe-math-vmu', 'host.js'), 'utf8')
  const kit = readFileSync(join(REPO, 'vibe-math-vmu', 'kit', 'paper.js'), 'utf8')
  const tools = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')
  const records = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'records.js'), 'utf8')
  const quality = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper-quality.js'), 'utf8')
  ok(/function titleOfCard\(args = \{\}, kindWord = 'card'\)/.test(handlers) && /const rowTitle = titleOfCard\(args, title\)/.test(handlers) && /title: rowTitle,/.test(handlers),
    '§0 a card title comes from title || id || the CLAIM — the probability is no longer a name')
  ok(/titleMeans: str\(args\.title\)\.trim\(\)/.test(handlers),
    '§0 the card receipt NAMES the title it used and where it came from')
  ok(/closureTally: \{/.test(meeting) && /face: 'vibe_vmu_status'/.test(meeting) && /closureTallyMeans/.test(meeting),
    '§0 the meeting summary points at the institute-level closure tally by name (⑩)')
  ok(/const truncatedBy = \[\]/.test(host) && /truncatedByMeans/.test(host) && /truncatedBy,/.test(host),
    '§0 a truncated records page names the ceiling that cut it (④)')
  ok(/editorGiven/.test(kit) && /source: editorGiven \?/.test(kit),
    '§0 the start receipt says which finaliser was used and whether it was a DEFAULT (⑦)')
  ok(/roundMeans: 'every `round` in this view/.test(tools) && /pdfCompiled: \{/.test(tools),
    '§0 the paper view states its round-vs-clock convention and reads the compile ledger (⑤/F9)')
  ok(/let lastRefusal = null/.test(records) && /lastRefusalMeans/.test(records),
    '§0 the records status can name its LAST refusal, not only count refusals (⑬)')
  ok(/function pointerText\(raw\)/.test(quality) && /const mathKey = \(s\) => str\(s\)/.test(quality) && /requiredLineMath/.test(quality),
    '§0 the quality gate strips markdown wrappers from pointers and accepts the MATH form of a verified title (①/②)')
}

// ── §1 a card with no title is named by its CLAIM, never by its probability ─────────────────────────────────────────
{
  const root = await newRoot('card-title')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  const card = await A.call('vibe_v5_record_proposition', {
    statement: 'Σ_{k=1}^{n} k³ = (n(n+1)/2)²', value: 1, motive: 'run 175 §1', p: 0.6, member: 'r-1' })
  ok(card && card.ok === true && typeof card.recordId === 'string', '§1 the card is written', card && (card.code || card.recordId))
  ok(card && String(card.title || '') === 'Σ_{k=1}^{n} k³ = (n(n+1)/2)²',
    '§1 ★★ the row name is the CLAIM, not `proposition 0.6`', card && card.title)
  ok(card && typeof card.titleMeans === 'string' && /CLAIM/.test(card.titleMeans),
    '§1 …and the receipt says where the name came from', card && card.titleMeans)
  const got = A.kernel.records.get({ id: card.recordId })
  const row = got && got.record ? got.record : got
  ok(row && String(row.title) === String(card.title),
    '§1 the durable row really carries that name (not only the receipt)', row && row.title)
  const named = await A.call('vibe_v5_record_proposition', {
    title: 'run175 explicit name', statement: 'x = x', value: 0.5, motive: 'explicit', p: 0.5, member: 'r-1' })
  ok(named && String(named.title) === 'run175 explicit name' && /title you passed/.test(String(named.titleMeans)),
    '§1 an explicit `title` still wins, and the receipt says so', named && { title: named.title, means: named.titleMeans })
}

// ── §2 a verified title with math is writable as MATH in the prose (②) ──────────────────────────────────────────────
{
  const root = await newRoot('math-title')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  const lit = 'Euler, Introductio, p. 12'
  const card = await A.call('vibe_v5_record_proposition', {
    statement: 'Σ_{k=1}^{n} k³ = (n(n+1)/2)²', value: 1, motive: 'run 175 §2', p: 1, member: 'r-1', literature_ref: lit })
  ok(card && card.ok === true, '§2 setup: the p=1 card is written', card && (card.code || card.recordId))
  const promoted = card && card.recordId ? await A.call('vibe_v5_verified_promote', {
    card: card.recordId, warrant_kind: 'literature', literature_ref: lit, member: 'r-acad' }) : null
  ok(promoted && promoted.ok === true && promoted.conclusion === true, '§2 setup: the card reaches the Verified track',
    promoted && (promoted.code || promoted.id))
  const name = String(card && card.title || '')
  ok(name !== '' && /[_^{}]/.test(name), '§2 setup: the verified title really carries math notation', name)
  const started = await A.call('vibe_v5_paper', { action: 'start', target: 'p2', participants: ['r-acad', 'r-1'] })
  ok(started && started.ok === true, '§2 setup: the paper starts', started && (started.code || started.id))
  const part = await A.call('vibe_v5_paper', { action: 'part', target: 'p2', member: 'r-acad',
    part: 'the cubic sum', solution: '正文按 §2 讨论这一结论。', evidence: [String(card.recordId)] })
  ok(part && part.ok === true, '§2 setup: a part with real evidence is accepted', part && (part.code || part.ok))
  const st = await A.call('vibe_v5_paper', { action: 'status', target: 'p2' })
  const state = Object.assign({}, st.paper, { status: 'awaiting-editor' })
  const view = qualityMod.createRecordsView({ kernel: A.kernel, codes: qualityMod.QUALITY_CODES })
  const rawVerdict = qualityMod.checkQuality({ md: '正文提到 ' + name + ' 这一结论。', state, view, codes: qualityMod.QUALITY_CODES })
  ok(rawVerdict && rawVerdict.ok === true, '§2 the RAW title still satisfies the gate (nothing that passed before fails now)',
    rawVerdict && (rawVerdict.code || rawVerdict.ok))
  const mathVerdict = qualityMod.checkQuality({ md: '正文提到 $' + name + '$ 这一结论。', state, view, codes: qualityMod.QUALITY_CODES })
  ok(mathVerdict && mathVerdict.ok === true,
    '§2 ★★ the MATH form (`$…$`, what the renderer keeps as math) ALSO satisfies the gate', mathVerdict && (mathVerdict.code || mathVerdict.ok))
  const absent = qualityMod.checkQuality({ md: '正文一个结论都没有提。', state, view, codes: qualityMod.QUALITY_CODES })
  const absentMissing = missingOf(absent)
  ok(absent && absent.ok === false && absentMissing.length > 0,
    '§2 a prose that omits the conclusion is still refused', absent && { code: absent.code, missing: absentMissing.length })
  ok(absentMissing.length > 0 && typeof absentMissing[0].requiredLineMath === 'string' && /^\$.*\$$/.test(absentMissing[0].requiredLineMath),
    '§2 …and the refusal hands over the `$…$` line to paste', absentMissing[0] && absentMissing[0].requiredLineMath)
  ok(String(absent && absent.hint || '').includes('配对 `$…$`'),
    '§2 …and the hint says the math form is accepted', String(absent && absent.hint || '').slice(0, 80))
}

// ── §3 start names the finaliser and whether it was a default (⑦) ───────────────────────────────────────────────────
{
  const root = await newRoot('editor')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  const plain = await A.call('vibe_v5_paper', { action: 'start', target: 'p3a', participants: ['r-acad', 'r-1'] })
  const plainStart = plain && plain.started ? plain.started : null
  ok(plainStart && plainStart.editor && plainStart.editor.value === 'academician' && plainStart.editor.source === 'default',
    '§3 ★★ omitting `editor` is reported AS A DEFAULT (not left to a later status)', plainStart && plainStart.editor)
  ok(plainStart && String(plainStart.editor.means || '').includes('no `editor` was passed'),
    '§3 …and the sentence says why', plainStart && String(plainStart.editor.means || '').slice(0, 60))
  const byChair = await A.call('vibe_v5_paper', { action: 'start', target: 'p3b', participants: ['r-acad', 'r-1'], editor: 'r-acad' })
  const chairStart = byChair && byChair.started ? byChair.started : null
  ok(chairStart && chairStart.editor && chairStart.editor.value === 'academician' && chairStart.editor.source === 'argument-normalised',
    '§3 a chair-seated member id is normalized to the role AND the receipt says so', chairStart && chairStart.editor)
}

// ── §4 the meeting board points at the institute-level closure tally (⑩) ────────────────────────────────────────────
{
  const root = await newRoot('closure-face')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  const opened = await A.call('vibe_v5_meeting', {
    action: 'convene', member: 'r-acad', agenda: 'run 175 §4', members: ['r-1', 'r-2'] })
  const meetingId = opened && (opened.id || opened.meeting) ? String(opened.id || opened.meeting) : null
  ok(!!meetingId, '§4 setup: a meeting is convened', opened && (opened.code || meetingId))
  if (meetingId) {
    const summary = await A.call('vibe_vmu_meeting', { action: 'summary', id: meetingId })
    ok(summary && summary.ok === true, '§4 the summary is readable', summary && (summary.code || summary.ok))
    ok(summary && summary.closureTally && summary.closureTally.face === 'vibe_vmu_status' && summary.closureTally.detail === 'closure',
      '§4 ★★ the summary NAMES the face that carries the closure votes', summary && summary.closureTally)
    ok(summary && typeof summary.closureTallyMeans === 'string' && /NOT record vote events|record NO vote events/.test(summary.closureTallyMeans),
      '§4 …and says the board records no vote events for them', summary && String(summary.closureTallyMeans || '').slice(0, 80))
  }
}

// ── §5 a truncated records page names the ceiling that cut it (④) ───────────────────────────────────────────────────
{
  const root = await newRoot('truncated-by')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  for (let i = 0; i < 5; i += 1) {
    A.kernel.records.put({ track: 'paper', kind: 'paper-part', title: 'run175 row ' + i, body: 'body ' + i, by: 'r-1' })
  }
  const page = await A.call('vibe_vmu_records', { action: 'list', limit: 2 })
  ok(page && page.ok === true && page.truncated === true, '§5 the page really is truncated', page && { total: page.total, returned: page.returned })
  ok(page && Array.isArray(page.truncatedBy) && page.truncatedBy.length > 0 && page.truncatedBy.some((s) => /limit/.test(String(s))),
    '§5 ★★ `truncatedBy` names THIS call\'s `limit`', page && page.truncatedBy)
  ok(page && typeof page.truncatedByMeans === 'string' && /limit:0/.test(page.truncatedByMeans),
    '§5 …and the means names the way to fetch the whole set', page && String(page.truncatedByMeans || '').slice(0, 60))
}

// ── §6 a refusal count can be traced to ONE refusal (⑬) ─────────────────────────────────────────────────────────────
{
  const root = await newRoot('last-refusal')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  let threw = null
  try { A.kernel.records.put({ track: 'no-such-track', kind: 'paper-part', title: 'nope', body: 'b' }) } catch (e) { threw = e }
  ok(!!threw && typeof threw.code === 'string', '§6 setup: a refusal really happened', threw && threw.code)
  const st = A.kernel.records.status()
  ok(st && Number(st.refusalsTotal) >= 1, '§6 the refusal is counted', st && st.refusalsTotal)
  ok(st && st.lastRefusal && st.lastRefusal.code === threw.code,
    '§6 ★★ the status can NAME the last refusal instead of only counting it', st && st.lastRefusal)
  ok(st && st.lastRefusal && typeof st.lastRefusal.at === 'number' && typeof st.lastRefusalMeans === 'string',
    '§6 …with its instant and a sentence saying earlier ones are only counted', st && st.lastRefusal)
}

// ── §7 a pointer quoted inside inline code is reported without the tick (①) ─────────────────────────────────────────
{
  const root = await newRoot('pointer-tick')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  const started = await A.call('vibe_v5_paper', { action: 'start', target: 'p7', participants: ['r-acad', 'r-1'] })
  ok(started && started.ok === true, '§7 setup: the paper starts', started && (started.code || started.id))
  const partRow = A.kernel.records.put({ track: 'paper', kind: 'paper-part', title: 'v5r-paper|p7|part|r-acad', by: 'r-acad',
    body: JSON.stringify({ title: 't', solution: '见 `Members/r-1/Propos/run175-not-a-record.md#§1` 这一条。', evidence: [] }) })
  ok(partRow && !!partRow.id, '§7 setup: the part row is on disk', partRow && partRow.id)
  const view = qualityMod.createRecordsView({ kernel: A.kernel, codes: qualityMod.QUALITY_CODES })
  const state = { target: 'p7', round: 1, status: 'awaiting-editor', participants: ['r-acad', 'r-1'], parts: { 'r-acad': { recordId: partRow.id, round: 1 } } }
  const verdict = qualityMod.checkQuality({ md: '', state, view, codes: qualityMod.QUALITY_CODES })
  const missing = missingOf(verdict)
  ok(verdict && verdict.ok === false && missing.length > 0, '§7 the fabricated pointer is refused', verdict && { code: verdict.code, missing: missing.length })
  ok(missing.length > 0 && String(missing[0].path || '').indexOf('`') < 0,
    '§7 ★★ the reported path carries no markdown tick', missing[0] && missing[0].path)
  ok(missing.length > 0 && String(missing[0].id || '') === 'run175-not-a-record',
    '§7 …and the id is the record id, not the path', missing[0] && missing[0].id)
}

// ── §8 the paper view reads the compile ledger and states its round convention (⑤/F9) ───────────────────────────────
{
  const root = await newRoot('pdf-compiled')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  const started = await A.call('vibe_v5_paper', { action: 'start', target: 'p8', participants: ['r-acad', 'r-1'] })
  ok(started && started.ok === true, '§8 setup: the paper starts', started && (started.code || started.id))
  const status = await A.call('vibe_v5_paper', { action: 'status', target: 'p8' })
  ok(status && status.ok === true, '§8 the status is readable', status && (status.code || status.ok))
  ok(status && status.pdfCompiled && status.pdfCompiled.produced === false && typeof status.pdfCompiled.means === 'string',
    '§8 ★★ `pdfCompiled` answers "is there a PDF?" in the same receipt (no compile row yet)', status && status.pdfCompiled)
  ok(status && typeof status.roundMeans === 'string' && /wall-clock/.test(status.roundMeans),
    '§8 …and the view states which numbers are rounds and which is a clock', status && String(status.roundMeans || '').slice(0, 70))
}

// ── summary ────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nRUN 175: ' + passed + ' passed, ' + failed + ' failed')
if (failed > 0) { console.error('failures:\n  ' + failures.join('\n  ')); process.exit(1) }
