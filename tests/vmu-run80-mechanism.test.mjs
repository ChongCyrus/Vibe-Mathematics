// tests/vmu-run80-mechanism.test.mjs — RUN 80 / TB-2750: four MECHANISM defects from the 80th live run.
//
// The live run measured four places where a face answered something it could not know, or kept a rule it only
// pretended to keep. Each section below drives the PRODUCTION door (the real pack entry, the real kernel, the real
// turn loop) and reads the receipt the caller would have read — no private helper is called and no fixture warms a
// memo before the read. Each section is followed by ONE red lamp: a whole-tree copy with the fix reverted, asserting
// the old (defective) answer comes back, then the copy is restored and its sha256 compared with the pristine file.
//
//   §1 F80-2  convene with BOTH agenda and materials: named refusal, never a silent materials win.
//   §2 F80-5  a status read that can see a compile row owes the verdict: not-run becomes ran-present (source named),
//             and a paper with no row still says not-run (no invented verdict).
//   §3 F80-1  a task without a brief cannot be taken: assign refused by name, list row ready:false with the code,
//             and the attach-brief repair makes it startable.
//   §4 F80-10 a held-turn reply that carries a ghost vote says so NOW: keptNow/keptWhy/fieldsKeeping + notCountedFields,
//             and the apply path's own row must give the SAME verdict (§4j-§4l).
//   §5 F80-1b the SECOND door: create({owner}) cannot refuse (the id must exist before a brief), so its receipt NAMES
//             ready:false / VMU_TASK_BRIEF_MISSING / assignmentUnreadable:true — with a lamp that reverts the naming.
//   §6 F80-1c the hire receipt describes the row AFTER the brief (revision + hasBrief + ready), not the create snapshot.
//
// Run: node tests/vmu-run80-mechanism.test.mjs   Last line: === VMU RUN80 MECHANISM: N passed, M failed ===
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs' // fs-purpose: whole-tree copies for the four red lamps, restored and sha256-compared
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

import { createTurnOrchestrator, deliverByReturning } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { v5rPromptSections } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { decideSections as DECIDE_SECTIONS } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')
const ENTRY = join(VMU, 'vibe-math-vmu.js')
const TMP = join(tmpdir(), 'tb2750')
mkdirSync(TMP, { recursive: true }) // fs-purpose: the four red-lamp workspaces live under this scratch root

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const eq = (actual, expected, label) => ok(actual === expected, label, { actual, expected })

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const fresh = (tag) => mkdtempSync(join(TMP, tag + '-'))

const bootPack = async (entryUrl, root) => {
  const entry = await import(entryUrl)
  const specs = []
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root })
  await handle.ready()
  if (handle.kernel && handle.kernel.store && typeof handle.kernel.store.open === 'function') await handle.kernel.store.open()
  return { handle, kernel: handle.kernel, specOf: (n) => specs.find((s) => s.name === n), specs }
}

const call = async (b, name, args) => {
  const spec = b.specOf(name)
  if (!spec) return { ok: false, code: 'NO_SUCH_TOOL', message: name }
  try {
    const out = await spec.execute(args || {}, { kernel: b.kernel, exec: null })
    return typeof out === 'string' ? JSON.parse(out) : out
  } catch (e) {
    return { ok: false, code: e && e.code ? e.code : null, message: e && e.message ? e.message : String(e), hint: e && e.hint ? e.hint : null, detail: e && e.detail ? e.detail : null }
  }
}

const NL = String.fromCharCode(10)
const pipeline = () => createPromptPipeline({ sections: v5rPromptSections, clock: () => '2026-01-01T00:00:00.000Z' })
const faces = { meetings: { speak: async () => ({ ok: true }), status: async () => ({ ok: true, meeting: null }) } }
const makeLoop = () => createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), faces, deliver: deliverByReturning() })

// A whole-tree copy, the mutation, and the restore — the ONE shape used by every lamp.
const withTree = async (tag, relFile, from, to, body) => {
  const dir = fresh(tag)
  cpSync(VMU, join(dir, 'vibe-math-vmu'), { recursive: true })
  const target = join(dir, 'vibe-math-vmu', relFile)
  const pristine = readFileSync(target)
  const before = pristine.toString('utf8')
  ok(before.includes(from), '§0 the lamp can find its mutation point in ' + relFile)
  writeFileSync(target, before.replace(from, to), 'utf8')
  const result = await body(join(dir, 'vibe-math-vmu', 'vibe-math-vmu.js'))
  writeFileSync(target, pristine)
  eq(sha(readFileSync(target)), sha(pristine), '§0 ' + tag + ' lamp restored byte-identically (sha256 equal to pristine)')
  return { dir, result }
}

console.log('=== VMU RUN80 MECHANISM ===')

// ── §1 F80-2: agenda AND materials must be refused by name ────────────────────────────────────────────────────
{
  const root = fresh('ws-f80-2')
  const b = await bootPack(pathToFileURL(ENTRY).href, root)
  await call(b, 'vibe_v5_start', { problem: 'run 80 mechanism', researcherCount: 1 })
  const both = await call(b, 'vibe_v5_meeting', { member: 'r-acad', title: 'run80', agenda: 'one; two', materials: ['m-a', 'm-b'] })
  eq(both.ok, false, '§1a convening with BOTH agenda and materials is refused (not silently overridden)')
  eq(both.code, 'VMU_MEETING_AGENDA_CONFLICT', '§1b the refusal is the NAMED code VMU_MEETING_AGENDA_CONFLICT')
  ok(typeof both.hint === 'string' && /pass ONE of them/.test(both.hint) && /materials/.test(both.hint),
    '§1c the hint says the fields are ONE stored line and offers the single-source calls', both.hint)
  ok(typeof both.message === 'string' && /silently drop one/.test(both.message),
    '§1d the refusal says WHICH lie it prevents (a silent drop of one of the two names)', both.message)
  ok(both.hint.indexOf('agenda:') !== -1 && both.hint.indexOf('materials:') !== -1,
    '§1e the hint spells out the two single-source calls (agenda: … or materials: …)', both.hint)
  eq(both.agendaItems, undefined, '§1f the refused call returns NO agendaItems (nothing was stored)')
  const single = await call(b, 'vibe_v5_meeting', { member: 'r-acad', title: 'run80 ok', agenda: 'one; two' })
  eq(single.ok, true, '§1g the SAME call with agenda only still convenes (the gate did not close the door)')
  ok(Array.isArray(single.agendaItems) && single.agendaItems.length === 2 && single.agendaItems[0] === 'one',
    '§1h and its agenda is the one the caller wrote', single.agendaItems)
  // ★★★ TB-2750 follow-up / LEAD DECISION "option ②": `materials` is the KERNEL-side name for the SAME one stored line.
  // The BOTH-supplied call above is refused; the legacy name ALONE must convene — otherwise this face's own conflict hint
  // would name a call it refuses (agenda required). §1i–§1m pin that door and the TOP-LEVEL shape of the refusal facts.
  const legacy = await call(b, 'vibe_v5_meeting', { member: 'r-acad', title: 'run80 legacy', materials: '核对 f(2k-1,2k) 的界; 讨论相邻两数互质; 文献格式' })
  eq(legacy.ok, true, '§1i the legacy single-source name (materials ALONE) is a legal convene — the conflict hint no longer names a call this face refuses')
  ok(Array.isArray(legacy.agendaItems) && legacy.agendaItems.length === 3 &&
    legacy.agendaItems[0] === '核对 f(2k-1,2k) 的界' && legacy.agendaItems[1] === '讨论相邻两数互质' && legacy.agendaItems[2] === '文献格式',
    '§1j …stored as the SAME three-item agenda (the comma inside item 1 is not a separator, the second item is whole)', legacy.agendaItems)
  eq(legacy.agendaSource, 'materials', '§1k …and the receipt NAMES which of the two names supplied the line')
  ok(legacy.agendaItemsSource === 'materials-line' && typeof legacy.agendaSourceMeans === 'string' && /SAME stored line/.test(legacy.agendaSourceMeans),
    '§1l …naming the split door (materials-line) and saying the two names are ONE line', { src: legacy.agendaItemsSource, means: legacy.agendaSourceMeans })
  ok(typeof both.reachableInstead === 'string' && both.materialsSupplied === true && both.agendaInputShape === 'string' && both.detail === undefined,
    '§1m the BOTH-supplied refusal carries reachableInstead/materialsSupplied/agendaInputShape at the TOP level (R97: refusal facts are never nested under `detail`)',
    { reachableInstead: both.reachableInstead, materialsSupplied: both.materialsSupplied, detail: both.detail })
  await withTree('lamp-materials-only', 'packs/v5r/tools.js',
    'const agendaFromLegacyName = !has(args.agenda) && has(args.materials)',
    'const agendaFromLegacyName = false',
    async (entryUrl) => {
      const b3 = await bootPack(pathToFileURL(entryUrl).href, fresh('ws-f80-2b-lamp'))
      await call(b3, 'vibe_v5_start', { problem: 'lamp materials', researcherCount: 1 })
      const lamp = await call(b3, 'vibe_v5_meeting', { member: 'r-acad', title: 'lamp materials', materials: 'one; two; three' })
      eq(lamp.ok, false, 'lamp option-② RED-worthy: with the single-source fallback reverted, materials ALONE is refused again (the hint would then name an unreachable call)')
      eq(lamp.code, 'VMU_INVALID_ARGUMENT', '…and it fails by the agenda-required code (the pre-fix behaviour)')
    })
  await withTree('lamp-f80-2', 'packs/v5r/tools.js',
    'const agendaNamedBoth = has(args.agenda) && has(args.materials)',
    'const agendaNamedBoth = false',
    async (entryUrl) => {
      const b2 = await bootPack(pathToFileURL(entryUrl).href, fresh('ws-f80-2-lamp'))
      await call(b2, 'vibe_v5_start', { problem: 'lamp', researcherCount: 1 })
      const lamp = await call(b2, 'vibe_v5_meeting', { member: 'r-acad', title: 'lamp', agenda: 'one; two', materials: ['m-a', 'm-b'] })
      ok(lamp.ok === true && lamp.code === undefined,
        'lamp F80-2 RED-worthy: with the gate reverted, passing both is accepted SILENTLY (the run 80 defect: one of the two names is dropped with no refusal)', lamp && { ok: lamp.ok, code: lamp.code, agendaSource: lamp.agendaSource })
    })
}

// ── §2 F80-5: a status read that sees a compile row owes the verdict ──────────────────────────────────────────
{
  const root = fresh('ws-f80-5')
  const b = await bootPack(pathToFileURL(ENTRY).href, root)
  await call(b, 'vibe_v5_start', { problem: 'run 80 mechanism', researcherCount: 1 })
  const noRow = await call(b, 'vibe_v5_paper', { action: 'start', target: 'p-none', title: 'no compile yet', participants: ['r-1'] })
  eq(noRow.ok, true, '§2a a paper can be started without a compile')
  const empty = await call(b, 'vibe_v5_paper', { action: 'status', target: 'p-none' })
  eq(empty.toolchainProbe, 'not-run', '§2b a paper with NO compile row still reads not-run (nothing invented)')
  eq(empty.toolchainProbeSource, undefined, '§2c and it names no evidence source, because there was none')
  const started = await call(b, 'vibe_v5_paper', { action: 'start', target: 'p1', title: 'paper one', participants: ['r-1'] })
  eq(started.ok, true, '§2d a second paper starts')
  const put = await b.kernel.records.put({
    track: 'paper',
    kind: 'paper-pdf',
    title: 'v5r-paper|p1|pdf',
    body: JSON.stringify({ pdfPath: 'Paper/p1/p1.pdf', pdfBytes: 111327, engine: 'xelatex', pdfSha256: 'a'.repeat(64), tried: [] }),
  })
  eq(put.ok, true, '§2e the durable paper ledger holds the compile row a run 80 receipt described')
  const st = await call(b, 'vibe_v5_paper', { action: 'status', target: 'p1' })
  eq(st.toolchainProbe, 'ran-present', '§2f the status read that can see the row reports ran-present (no not-run beside a compiled PDF)')
  eq(st.toolchainProbeSource, 'paper-ledger', '§2g and it NAMES the evidence source (paper-ledger, not this session memo)')
  ok(typeof st.toolchainProbeMeans === 'string' && /durable paper ledger/.test(st.toolchainProbeMeans),
    '§2h the means sentence explains the verdict and where it came from', st.toolchainProbeMeans)
  ok(st.pdfCompiled && st.pdfCompiled.produced === true && st.pdfCompiled.pdfBytes === 111327,
    '§2i the pdf reading agrees with the probe (one receipt cannot contradict itself)', st.pdfCompiled)
  await withTree('lamp-f80-5', 'packs/v5r/tools.js',
    "toolchainProbe: 'ran-present',",
    "toolchainProbe: 'not-run',",
    async (entryUrl) => {
      const b2 = await bootPack(pathToFileURL(entryUrl).href, fresh('ws-f80-5-lamp'))
      await call(b2, 'vibe_v5_start', { problem: 'lamp', researcherCount: 1 })
      await call(b2, 'vibe_v5_paper', { action: 'start', target: 'p1', title: 'lamp', participants: ['r-1'] })
      await b2.kernel.records.put({ track: 'paper', kind: 'paper-pdf', title: 'v5r-paper|p1|pdf', body: JSON.stringify({ pdfPath: 'Paper/p1/p1.pdf', pdfBytes: 111327, engine: 'xelatex', pdfSha256: 'a'.repeat(64), tried: [] }) })
      const lamp = await call(b2, 'vibe_v5_paper', { action: 'status', target: 'p1' })
      eq(lamp.toolchainProbe, 'not-run', 'lamp F80-5 RED-worthy: with the ledger upgrade reverted, a compiled paper reads not-run again')
    })
}

// ── §3 F80-1: no brief, no taking ────────────────────────────────────────────────────────────────────────────
{
  const root = fresh('ws-f80-1')
  const b = await bootPack(pathToFileURL(ENTRY).href, root)
  await call(b, 'vibe_v5_start', { problem: 'run 80 mechanism', researcherCount: 1 })
  const t = b.kernel.tasks
  const made = await t.create({ title: 'a task with only a title' })
  eq(made.ok, true, '§3a a task may be created without a brief (created first, briefed next)')
  const row0 = t.list().find((r) => r.id === made.id)
  ok(!!row0, '§3b the created row is listed')
  eq(row0.ready, false, '§3c an unbriefed row is NOT ready')
  eq(row0.readyCode, 'VMU_TASK_BRIEF_MISSING', '§3d and the row NAMES why: VMU_TASK_BRIEF_MISSING')
  eq(row0.hasBrief, false, '§3e the row says hasBrief:false (rather than leaving a reader to guess)')
  let taken = null
  try { taken = await t.assign(made.id, 'r-1') } catch (e) { taken = { ok: false, code: e && e.code, message: e && e.message, hint: e && e.hint } }
  eq(taken.ok, false, '§3f assigning an unbriefed task is REFUSED (a task is taken only after the brief is written)')
  eq(taken.code, 'VMU_TASK_BRIEF_MISSING', '§3g the refusal is the NAMED code VMU_TASK_BRIEF_MISSING')
  ok(typeof taken.message === 'string' && /carries no brief/.test(taken.message), '§3h the message names the missing content', taken.message)
  ok(typeof taken.hint === 'string' && /action: "brief"/.test(taken.hint), '§3i the hint names the repair door (task brief)', taken.hint)
  eq(t.list().find((r) => r.id === made.id).owner, null, '§3j the refused assignment left NO partial owner on the row')
  await t.brief(made.id, 'prove the lemma and write the proof down', { by: 'office' })
  const row1 = t.list().find((r) => r.id === made.id)
  eq(row1.ready, true, '§3k after the brief the row becomes ready (the gate is a brief gate, not a wall)')
  eq(row1.readyCode, null, '§3l and its readyCode is null')
  eq(row1.hasBrief, true, '§3m with hasBrief:true')
  const assigned = await t.assign(made.id, 'r-1')
  eq(assigned.ok, true, '§3n the same assign now goes through')
  eq(assigned.readable, true, '§3o and the receipt says the assignee can READ the work')
  eq(assigned.contentSource, 'brief', '§3p naming the content source (brief)')
  await withTree('lamp-f80-1', 'kernel/tasks.js',
    'if (!briefs.has(t.id)) throw briefMissingRefusal(t, contentOf(t))',
    'if (false) throw briefMissingRefusal(t, contentOf(t))',
    async (entryUrl) => {
      const b2 = await bootPack(pathToFileURL(entryUrl).href, fresh('ws-f80-1-lamp'))
      await call(b2, 'vibe_v5_start', { problem: 'lamp', researcherCount: 1 })
      const made2 = await b2.kernel.tasks.create({ title: 'unbriefed under the lamp' })
      const lamp = await b2.kernel.tasks.assign(made2.id, 'r-1')
      ok(lamp.ok === true && lamp.owner === 'r-1',
        'lamp F80-1 RED-worthy: with the brief gate reverted, an UNBRIEFED task is assigned anyway', lamp && { ok: lamp.ok, owner: lamp.owner })
    })
}

// ── §4 F80-10: the held-turn receipt answers the vote question NOW ───────────────────────────────────────────
{
  const loop = makeLoop()
  const d = await loop.drive({ members: [{ id: 'm1' }], rounds: 1, phase: 'meeting', why: 'run 80' })
  eq(d.ok, true, '§4a a member turn is parked')
  eq(d.awaiting, true, '§4b and the loop says it is awaiting the answer (this is the channel that produced F80-10)')
  const rec = await loop.supplyStructuredReply({ vote_solved: true }, { forMember: 'm1' })
  eq(rec.ok, true, '§4c the report is accepted onto the held turn')
  eq(rec.accepted, true, '§4d accepted:true still means RECORDED (the write fact is unchanged)')
  eq(rec.keptNow, false, '§4e ★ the SAME receipt already says the vote will NOT count (no waiting for the next step)')
  ok(typeof rec.keptWhy === 'string' && rec.keptWhy !== '', '§4f ★ and it names why', rec.keptWhy)
  ok(Array.isArray(rec.fieldsKeeping) && rec.fieldsKeeping.length === 1 && rec.fieldsKeeping[0].field === 'vote_solved' && rec.fieldsKeeping[0].keptNow === false,
    '§4g fieldsKeeping carries the per-field verdict with the field name', rec.fieldsKeeping)
  ok(rec.countedLater && Array.isArray(rec.countedLater.notCountedFields) && rec.countedLater.notCountedFields.indexOf('vote_solved') !== -1,
    '§4h countedLater no longer promises one-sidedly: it names the field it will NOT count', rec.countedLater)
  ok(typeof rec.keptNowMeans === 'string' && /SURVIVE the apply/.test(rec.keptNowMeans),
    '§4i the means sentence separates accepted (write) from counted (effect)', rec.keptNowMeans)
  // ★★★ TB-2750 follow-up (F80-10, ONE ANSWER TWO READERS): the receipt decision and the apply path's row are two copies
  // of the same branch tree. A drift between them would let the receipt promise what apply then drops — so consume the
  // held turn and compare kept/keptWhy/reason field-for-field.
  const applied = await loop.completeStructuredReply()
  const appliedRows = (applied && (applied.fieldsIgnored || applied.bookkeeping)) || []
  const appliedVote = appliedRows.filter((r) => r && r.field === 'vote_solved')[0] || null
  ok(!!appliedVote, '§4j the apply path produced its own vote_solved row (the held report was consumed)', applied && { ok: applied.ok, rows: appliedRows.length })
  ok(!!appliedVote && appliedVote.kept === (rec.keptNow === true) && appliedVote.keptWhy === rec.keptWhy,
    '§4k ★ the receipt and the apply row give the SAME verdict (kept/keptWhy agree field-for-field)',
    { receipt: { keptNow: rec.keptNow, keptWhy: rec.keptWhy }, apply: appliedVote })
  ok(!!appliedVote && !!rec.fieldsKeeping[0] && appliedVote.reason === rec.fieldsKeeping[0].reason,
    '§4l ★ …and the same REASON sentence, not just the same code',
    { receiptReason: rec.fieldsKeeping[0] && rec.fieldsKeeping[0].reason, applyReason: appliedVote && appliedVote.reason })
  await withTree('lamp-f80-10', 'kernel/turn/index.js',
    'const voteKeeping = (() => {',
    'const voteKeeping = (() => { return null;',
    async (entryUrl) => {
      // The lamp must exercise the MUTATED module, so it loads the copy's turn module directly (ESM caches by URL,
      // and a different directory is a different URL — the pristine module stays untouched).
      const copyTurn = entryUrl.replace(/vibe-math-vmu\.js$/, 'kernel/turn/index.js')
      const mod = await import(pathToFileURL(copyTurn).href)
      const loop2 = mod.createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), faces, deliver: mod.deliverByReturning() })
      await loop2.drive({ members: [{ id: 'm1' }], rounds: 1, phase: 'meeting', why: 'lamp' })
      const lamp = await loop2.supplyStructuredReply({ vote_solved: true }, { forMember: 'm1' })
      ok(lamp.keptNow === true && lamp.keptWhy === null && lamp.fieldsKeeping.length === 0,
        'lamp F80-10 RED-worthy: with the verdict removed, the receipt falls back to keptNow:true / no why (the run 80 ghost vote)', lamp && { keptNow: lamp.keptNow, keptWhy: lamp.keptWhy })
    })
}

// ── §5 F80-1b the SECOND door: create({owner}) cannot refuse, so it NAMES; the lamp removes the naming ─────────
{
  const b = await bootPack(pathToFileURL(ENTRY).href, fresh('ws-f80-1b'))
  await call(b, 'vibe_v5_start', { problem: 'run 80 second door', researcherCount: 1 })
  const made = await b.kernel.tasks.create({ title: 'owner planted, brief next', owner: 'r-1' })
  eq(made.ok, true, '§5a create({owner}) still plants the owner (the composing faces need the id before the brief)')
  eq(made.state, 'assigned', '§5b …so the row state is still assigned (this door is not the one that refuses)')
  eq(made.ready, false, '§5c ★ …but the receipt says NOT STARTABLE')
  eq(made.readyCode, 'VMU_TASK_BRIEF_MISSING', '§5d ★ …and names the missing half (VMU_TASK_BRIEF_MISSING)')
  eq(made.readable, false, '§5e readable:false (the SAME readiness reading list/assign publish)')
  eq(made.contentSource, 'none', '§5f contentSource:"none" — the objective cannot stand in for the work text')
  eq(made.assignmentUnreadable, true, '§5g ★ assignmentUnreadable:true — the second door NAMES what it cannot refuse')
  ok(typeof made.assignmentMeans === 'string' && /brief/.test(made.assignmentMeans),
    '§5h the means sentence points at the repair (write the brief, or create without owner then assign)', made.assignmentMeans)
  const row = b.kernel.tasks.list().filter((r) => r.id === made.id)[0]
  eq(row && row.ready, false, '§5i the BOARD row agrees with the receipt (one reading, two readers)')
  eq(row && row.readyCode, 'VMU_TASK_BRIEF_MISSING', '§5j …and the row names the same code')
  await b.kernel.tasks.brief(made.id, 'the readable statement of the work', { by: 'office' })
  const row2 = b.kernel.tasks.list().filter((r) => r.id === made.id)[0]
  eq(row2 && row2.ready, true, '§5k the brief turns the row ready (it was named-missing, not stranded)')
  await withTree('lamp-f80-1b', 'kernel/tasks.js',
    '        ...readiness,\n        assignmentUnreadable: t.owner !== null && !readiness.readable,',
    '',
    async (entryUrl) => {
      const copyTasks = entryUrl.replace(/vibe-math-vmu\.js$/, 'kernel/tasks.js')
      const mod = await import(pathToFileURL(copyTasks).href)
      const l = mod.createTasks({ clock: () => 1000 })
      const lamp = await l.create({ title: 'owner planted, brief next', owner: 'r-1' })
      ok(lamp.readable === undefined && lamp.readyCode === undefined && lamp.assignmentUnreadable === undefined,
        'lamp F80-1b RED-worthy: with the naming reverted the create receipt is SILENT again (the run 80 second door)',
        lamp && { readable: lamp.readable, readyCode: lamp.readyCode, assignmentUnreadable: lamp.assignmentUnreadable })
    })
}

// ── §6 F80-1c the hire receipt describes the row AFTER the brief, not the create snapshot ───────────────────
{
  const b = await bootPack(pathToFileURL(ENTRY).href, fresh('ws-f80-1c'))
  await call(b, 'vibe_v5_start', { problem: 'run 80 hire', researcherCount: 1 })
  const hire = await call(b, 'vibe_v5_hire', { to: 'r-temp', slot: 'temp', purpose: '核对一处引理表述', initial_task: '核对一处引理表述' })
  eq(hire.ok, true, '§6a the hire went through', hire && { ok: hire.ok, code: hire.code })
  const hiredId = hire && hire.task && hire.task.id ? hire.task.id : null
  const boardRow = hiredId === null ? null : (b.kernel.tasks.list().filter((r) => r.id === hiredId)[0] || null)
  ok(!!boardRow, '§6b the hired task is on the board', boardRow && boardRow.id)
  eq(hire.task && hire.task.revision, boardRow && boardRow.revision,
    '§6c ★ the receipt revision EQUALS the board revision (the brief bumped it; the receipt was refreshed)')
  eq(hire.task && hire.task.hasBrief, true, '§6d the receipt says hasBrief:true (not the create-time snapshot)')
  eq(hire.task && hire.task.ready, true, '§6e …and ready:true (the fresh seat can start)')
  eq(hire.task && hire.task.readable, true, '§6f …readable:true')
  eq(hire.task && hire.task.contentSource, 'brief', '§6g …contentSource:"brief"')
  // ★ the OTHER composing face: `vibe_v5_assign` carries the assignment's why+acceptance, which IS the work statement.
  // It must turn them into the brief (assign refuses an unbriefed take) and return the row as it stands after it.
  const asg = await call(b, 'vibe_v5_assign', { to: 'r-1', subject: '把读数写清楚', why: '状态板需要可核的读数', acceptance: '给出可核的回执字段' })
  eq(asg.ok, true, '§6h vibe_v5_assign went through', asg && { ok: asg.ok, code: asg.code, message: asg.message })
  const asgRow = asg && asg.taskId ? (b.kernel.tasks.list().filter((r) => r.id === asg.taskId)[0] || null) : null
  ok(!!asgRow, '§6i the assigned task is on the board', asgRow && asgRow.id)
  eq(asg.created && asg.created.hasBrief, true, '§6j ★ the assign face wrote the brief from its own why+acceptance (no assigned-but-unreadable row)')
  eq(asg.created && asg.created.ready, true, '§6k …and the created row it returns is READY')
  eq(asg.created && asg.created.revision, asgRow && asgRow.revision,
    '§6l ★ …and its revision equals the board revision (the brief bumped it, the receipt was refreshed)')
  eq(asgRow && asgRow.owner, 'r-1', '§6m the board row is owned by the assignee')
  // ★ §6n–t: the EXISTING-task_id branch of the same face. Lead ruling: it fills a brief ONLY when briefOf says the task
  // has none (VMU_NO_SUCH_OBJECT); an existing brief is NOT overwritten, and any OTHER read failure is rethrown.
  const ex = await b.kernel.tasks.create({ title: '既有任务' })
  const exAssigned = await call(b, 'vibe_v5_assign', { task_id: ex.id, to: 'r-1', why: '理由原文', acceptance: '验收原文' })
  eq(exAssigned.ok, true, '§6n the existing-task branch assigns the task', exAssigned && { ok: exAssigned.ok, code: exAssigned.code, message: exAssigned.message })
  const exRow = b.kernel.tasks.list().filter((r) => r.id === ex.id)[0]
  eq(exRow && exRow.owner, 'r-1', '§6o …and it is owned')
  eq(exRow && exRow.hasBrief, true, '§6p …and it became READABLE (no assigned-but-unreadable row)')
  const exBrief = b.kernel.tasks.briefOf(ex.id)
  ok(/理由原文/.test(exBrief.brief) && /验收原文/.test(exBrief.brief), "§6q …the brief is the caller's own why+acceptance", exBrief && exBrief.brief)
  const keepId = (await b.kernel.tasks.create({ title: '已有 brief' })).id
  b.kernel.tasks.brief(keepId, '原创：这才是正文', { by: 'office' })
  await b.kernel.tasks.assign(keepId, 'r-1')
  const keepAssigned = await call(b, 'vibe_v5_assign', { task_id: keepId, to: 'r-acad', why: '新理由', acceptance: '新验收' })
  ok(keepAssigned.ok === true, '§6r re-assigning an already-briefed task goes through', keepAssigned && { ok: keepAssigned.ok, code: keepAssigned.code, message: keepAssigned.message })
  eq(b.kernel.tasks.briefOf(keepId).brief, '原创：这才是正文', '§6s ★ an EXISTING brief is NOT overwritten (the face only fills an absence)')
  // a briefOf failure that is NOT "no brief" must TRAVEL by name (the face may only fill an absence). The pack wrapper
  // hands back a refusal receipt instead of a throw, so the assertion is on the code AND on what did not happen.
  const realBriefOf = b.kernel.tasks.briefOf
  const ownerBefore = b.kernel.tasks.list().filter((r) => r.id === keepId)[0].owner
  let storeFailure = null
  try {
    b.kernel.tasks.briefOf = () => { const e = new Error('store exploded'); e.code = 'VMU_STORE_FAILED'; throw e }
    storeFailure = await call(b, 'vibe_v5_assign', { task_id: keepId, to: 'r-1', why: 'w', acceptance: 'a' })
  } finally { b.kernel.tasks.briefOf = realBriefOf }
  eq(storeFailure && storeFailure.code, 'VMU_STORE_FAILED', '§6t ★ a briefOf failure OTHER than "has no brief" TRAVELS by name (never swallowed as an absence)', storeFailure && { code: storeFailure.code })
  eq(b.kernel.tasks.briefOf(keepId).brief, '原创：这才是正文', '§6u …and the existing brief was NOT overwritten by a failed read')
  eq(b.kernel.tasks.list().filter((r) => r.id === keepId)[0].owner, ownerBefore, '§6v …and no assignment happened')
}

// ── §7 F80-1d / R5-b: a composing door that WRITES the brief must return the POST-brief truth ────────────────
// The kernel's create({owner}) receipt names `assignmentUnreadable:true` (an owner existed before a brief). A face that
// then writes the brief IN THE SAME CALL must not hand that verdict back beside `readable:true/ready:true` — one
// receipt, one reading. The lamp deletes the post-brief overwrite and requires the contradiction to come back.
{
  const b = await bootPack(pathToFileURL(ENTRY).href, fresh('ws-f80-1d'))
  await call(b, 'vibe_v5_start', { problem: 'run 80 composer', researcherCount: 1 })
  const hire = await call(b, 'vibe_v5_hire', { to: 'r-temp', slot: 'temp', purpose: '核对一处引理表述', initial_task: '核对一处引理表述' })
  eq(hire.ok, true, '§7a the hire went through', hire && { ok: hire.ok, code: hire.code })
  eq(hire.task && hire.task.readable, true, '§7b the hire receipt says the row is readable')
  eq(hire.task && hire.task.assignmentUnreadable, false, '§7c ★ …and does NOT also say "assigned but unreadable" (one receipt, one reading)')
  eq(hire.task && hire.task.assignmentMeans, null, '§7d ★ the create-time warning is GONE (null = named absence), not merely contradicted')
  const asg = await call(b, 'vibe_v5_assign', { to: 'r-1', subject: '把读数写清楚', why: '状态板需要可核的读数', acceptance: '给出可核的回执字段' })
  eq(asg.ok, true, '§7e vibe_v5_assign went through', asg && { ok: asg.ok, code: asg.code })
  eq(asg.created && asg.created.readable, true, '§7f the created row the assign face returns is readable')
  eq(asg.created && asg.created.assignmentUnreadable, false, '§7g ★ …and not simultaneously "unreadable"')
  eq(asg.created && asg.created.assignmentMeans, null, '§7h ★ same for the assign face')
  await withTree('lamp-f80-1d', 'packs/v5r/tools.js',
    ', { assignmentUnreadable: false, assignmentMeans: null })',
    ')',
    async (entryUrl) => {
      const b2 = await bootPack(pathToFileURL(entryUrl).href, fresh('ws-f80-1d-lamp'))
      await call(b2, 'vibe_v5_start', { problem: 'lamp', researcherCount: 1 })
      const h = await call(b2, 'vibe_v5_hire', { to: 'r-temp', slot: 'temp', purpose: '核对', initial_task: '核对' })
      ok(h.task && h.task.readable === true && h.task.assignmentUnreadable === true,
        'lamp F80-1d RED-worthy: with the post-brief overwrite reverted, the SAME receipt says readable:true AND assignmentUnreadable:true (the contradiction this section closes)',
        h.task && { readable: h.task.readable, assignmentUnreadable: h.task.assignmentUnreadable })
    })
}

console.log('')
console.log('=== VMU RUN80 MECHANISM: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.error('failed: ' + failures.join(' | '))
  process.exitCode = 1
}
