// tests/vmu-run69-card-fields.test.mjs — ROUND 69 (F-64 / F-65): THE VALUES WERE ONLY PROSE TO THE READER.
//
// TWO DEFECTS, ONE SUBJECT: a fact the framework has, that the reader cannot reach.
//
// F-65 (measured on the real machine, run 69, build 5c5b3532). The office wrote a proposition card, then read it back
// with `vibe_v5_read_library { id }`: the row carried `card.body` (the author's text, "- statement：… - p：0.6 …") and
// NO `p`, no `value`, no `proofState` on the row. The framework ITSELF had those values — `verified.js#parseCardBody`
// parses that same prose for the debate and verified gates — so one fact existed twice and the copy handed to the agent
// was the one it cannot compute with. An agent that must re-parse another tool's prose is being asked to be the parser.
//
// F-64 (same run). `vibe_vmu_records { action:"status" }` was refused `VMU_INVALID_ARGUMENT unknown action: status`,
// because the tool's enum was `list|expand|append` — while `records.status().shared` had carried the ROUND 68 adoption
// counter (`adoptedWithoutAuthor`) since that round. A fact that only a test can read is not a fact the product reports.
//
// WHAT IS ASSERTED HERE:
//   ① a proposition row's `cardFields` carry the parsed values (p / statement / value / motive) AND the body still does;
//   ② `cardFieldsMeans` names the ONE authority those values come from (no second parser was written);
//   ③ a card that cannot be judged reports `p: null` PLUS `cardUnjudgeable` — never a silent zero, never a guess;
//   ④ rows of other tracks do not grow `cardFields` (the projection belongs to proposition cards only);
//   ⑤ `vibe_vmu_records { action:"status" }` answers, and its shared section carries the adoption counter with its means;
//   ⑥ an unknown action is still refused, and the refusal keeps naming the actions that exist.
//
// RULE E: every collection assertion states its exact expected shape in the same expression.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const entry = await import(pathToFileURL(ENTRY).href)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const boot = async (config = {}, ctxExtra = {}) => {
  const state = { specs: [] }
  const ctx = Object.assign({
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }, ctxExtra)
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'] }, config))
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const callJSON = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, {}) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
}

const dir = await mkdtemp(join(tmpdir(), 'vmu-r69-fields-'))
try {
  const b = await boot({ root: dir }, { sessionId: 'session-r69' })
  ok(!b.specOf('vibe_v5_read_library') || typeof b.specOf('vibe_v5_read_library').execute === 'function',
    'the v5 read face is registered', Object.keys(b.handle || {}))

  const started = await callJSON(b, 'vibe_v5_start', { problem: '第69轮：卡体里的值必须有程序可读的形状（整数平方和 n^2+n 恒偶）', researcherCount: 1 })
  ok(started.parsed && started.parsed.ok === true, 'the institute starts (the pack assembles)', started)

  const wrote = await callJSON(b, 'vibe_v5_record_proposition', {
    statement: 'n^2 + n 恒为偶数（∀ n ∈ ℕ）', value: '对任意自然数成立', motive: '轮次 69 的投影复验', p: 0.6,
  })
  ok(wrote.parsed && wrote.parsed.ok === true, 'a proposition card is written', wrote)
  const recId = wrote.parsed && wrote.parsed.recordId

  // ── ① the single-card read carries BOTH shapes ────────────────────────────────────────────────────────────────
  const one = await callJSON(b, 'vibe_v5_read_library', { id: recId })
  const card = one.parsed && one.parsed.card
  ok(card && typeof card === 'object', 'read_library {id} returns the card', one)
  ok(card && typeof card.body === 'string' && card.body.indexOf('p：') !== -1,
    'the card body is still the author\'s text (nothing was rewritten)', card && String(card.body).slice(0, 60))
  const cf = card && card.cardFields
  ok(cf && cf.p === 0.6, 'cardFields.p is the NUMBER the body states (0.6), not prose', cf)
  ok(cf && cf.statement === 'n^2 + n 恒为偶数（∀ n ∈ ℕ）', 'cardFields.statement is the statement as a value', cf && cf.statement)
  ok(cf && cf.value === '对任意自然数成立', 'cardFields.value is a value the program can compare', cf && cf.value)
  ok(cf && cf.motive === '轮次 69 的投影复验', 'cardFields.motive is a value', cf && cf.motive)
  ok(cf && cf.proofState === null, 'a field the author did not write reads null, not an invented string', cf && cf.proofState)

  // ── ② the means names the ONE authority (no second parser) ───────────────────────────────────────────────────
  const means = String((card && card.cardFieldsMeans) || '')
  ok(means.indexOf('parseCardBody') !== -1 && means.indexOf('card.body') !== -1,
    'cardFieldsMeans names the one authority that parses the body and says the body stays the author\'s', means.slice(0, 120))
  ok(means.indexOf('does NOT mean p is zero') !== -1 || means.indexOf('NOT mean') !== -1,
    'and it denies the wrong reading of a null p', means.slice(-90))

  // ── ④ the list form decorates proposition rows and only those ────────────────────────────────────────────────
  const progress = await callJSON(b, 'vibe_v5_record_progress', { title: 'r69 进度', content: '投影复验的进度行', track: 'progress', member: 'r-1' })
  ok(progress.parsed && progress.parsed.ok === true, 'a progress row is written beside the card', progress)
  const listed = await callJSON(b, 'vibe_v5_read_library', { list: true })
  const rows = (listed.parsed && Array.isArray(listed.parsed.cards)) ? listed.parsed.cards : []
  ok(rows.length >= 2, 'the list form returns both rows', listed.parsed && listed.parsed.total)
  const propRow = rows.find((r) => r && String(r.track) === 'propositions')
  const progRow = rows.find((r) => r && String(r.track) === 'progress')
  ok(propRow && propRow.cardFields && propRow.cardFields.p === 0.6,
    'the proposition row in the list carries cardFields (list rows are heads: the body is read for this)', propRow && propRow.track)
  ok(progRow && progRow.cardFields === undefined,
    'a progress row does not grow cardFields (the projection belongs to proposition cards)', progRow && Object.keys(progRow))

  // ── ③ a body that cannot be judged: null p PLUS the reason ──────────────────────────────────────────────────
  const bad = await callJSON(b, 'vibe_v5_record_proposition', {
    statement: '坏卡：正文缺 p', value: 'v', motive: 'm', p: 0.5,
  })
  const badId = bad.parsed && bad.parsed.recordId
  const records = b.handle && b.handle.kernel ? b.handle.kernel.records : null
  ok(records && typeof records.put === 'function', 'the kernel records face is reachable for a raw bad body', Object.keys(b.handle || {}))
  // overwrite the body with text that has no `- p：` line: the SAME id, a body the parser refuses
  await records.put({ id: badId, track: 'propositions', kind: 'proposition', title: '坏卡', body: '- statement：坏卡：正文缺 p\n- value：v\n- motive：m\n', by: 'r-1' })
  const badRead = await callJSON(b, 'vibe_v5_read_library', { id: badId })
  const badCard = badRead.parsed && badRead.parsed.card
  ok(badCard && badCard.cardFields && badCard.cardFields.p === null,
    'an unjudgeable body reports p: null (never a silent 0)', badCard && badCard.cardFields)
  ok(badCard && typeof badCard.cardUnjudgeable === 'string' && /p/.test(badCard.cardUnjudgeable),
    'and it carries the parser\'s own reason (the missing field is named)', badCard && badCard.cardUnjudgeable)

  // ── ⑤ the records face answers `status`, and the adoption counter is readable ───────────────────────────────
  const st = await callJSON(b, 'vibe_vmu_records', { action: 'status' })
  const stp = st.parsed
  ok(stp && stp.ok === true && stp.action === 'status', 'vibe_vmu_records {action:"status"} answers instead of refusing', st)
  ok(stp && stp.shared && typeof stp.shared.adoptedWithoutAuthor === 'number',
    'the shared section carries the ROUND 68 adoption counter as a number', stp && stp.shared)
  ok(stp && typeof stp.shared.adoptedWithoutAuthorMeans === 'string' && stp.shared.adoptedWithoutAuthorMeans.indexOf('ROW') !== -1,
    'and the counter says what it counts (a row that did not name its writer)', stp && stp.shared.adoptedWithoutAuthorMeans)
  ok(stp && stp.records && typeof stp.records.total === 'number' && stp.records.byTrack && typeof stp.records.byTrack === 'object',
    'the view reports the row counts per track', stp && stp.records)
  ok(stp && typeof stp.note === 'string' && /bounded/.test(stp.note),
    'and it declares itself bounded (a status is not a dump)', stp && stp.note)

  // ── ⑤b ROUND 70 / F-66: those counters are THIS kernel's folds, not the ledger's global numbers ─────────────
  // Run 70 read the same ledger from two kernels: office said adoptedWithoutAuthor 0 (pulls 17), the member's own kernel
  // said 1 (pulls 3). Both receipts looked like ledger facts, so a reader comparing them had no way to tell which one
  // described the durable ledger. The counters must say whose they are.
  ok(stp && stp.shared && stp.shared.scope === 'this-kernel-instance',
    'the counters declare their scope (this kernel, not the ledger)', stp && stp.shared && stp.shared.scope)
  ok(stp && stp.shared && typeof stp.shared.scopeMeans === 'string'
    && /THIS kernel/.test(stp.shared.scopeMeans) && /two kernels/.test(stp.shared.scopeMeans),
    'and the scope sentence says another kernel over the same store folds its own copy (two kernels may differ)',
    stp && stp.shared && stp.shared.scopeMeans)
  ok(stp && typeof stp.recordsMeans === 'string' && /own folds/.test(stp.recordsMeans) && /own view/.test(stp.recordsMeans),
    'the row counts say they are what this kernel sees after its own folds', stp && stp.recordsMeans)

  // …and a SECOND kernel over the same store reports the same declared scope (the number may differ; the scope may not).
  const b2 = await boot({ root: dir, instance: 'shared' }, { sessionId: 'session-kernel-two' })
  const st2 = await callJSON(b2, 'vibe_vmu_records', { action: 'status' })
  ok(st2.parsed && st2.parsed.shared && st2.parsed.shared.scope === 'this-kernel-instance',
    'a second kernel over the same store declares the same scope on its own counters',
    st2.parsed && st2.parsed.shared && st2.parsed.shared.scope)
  ok(st2.parsed && typeof st2.parsed.recordsMeans === 'string' && /own/.test(st2.parsed.recordsMeans),
    'and its row counts carry the same per-kernel sentence', st2.parsed && st2.parsed.recordsMeans)

  // ── ⑥ unknown action still refused, and the refusal names the existing actions ──────────────────────────────
  const nope = await callJSON(b, 'vibe_vmu_records', { action: 'nope' })
  ok(nope.parsed && nope.parsed.ok === false && nope.parsed.code === 'VMU_INVALID_ARGUMENT',
    'an unknown action is refused by name', nope)
  ok(nope.parsed && /list/.test(String(nope.parsed.hint || '')),
    'and the refusal still names the actions that exist', nope.parsed && nope.parsed.hint)
} finally {
  try { await rm(dir, { recursive: true, force: true, maxRetries: 10 }) } catch { /* the store write may still land */ }
}

console.log('\nROUND 69 CARD FIELDS: ' + passed + ' passed, ' + failed + ' failed')
if (failed > 0) { for (const f of failures) console.error('  - ' + f); process.exitCode = 1 }
