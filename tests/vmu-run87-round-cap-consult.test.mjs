#!/usr/bin/env node
// vmu RUN 86/87 — A POLICY THE RULE GIVES THE CHAIR MUST HAVE A REACHABLE KNOB, AND A GATE'S ONLY
// DECLARED ANSWERER MUST BE ANSWERABLE.
//
// THE OBSERVED DEFECTS (live run 86 = the paper sweep, live run 87 = the instruct sweep):
//   F-86a  `vmu.paper.officeConsult` defaults to "required", so `final` asks the OFFICE a question; the pack declares
//          `PAPER_CONSULT_ROLES = ['office']` as the only legitimate answerer; and `consult { member: "office" }` was
//          refused `VMU_NO_SUCH_OBJECT "no member office on this roster"`. A roster is about RESEARCHERS; the office is
//          the session running the work. The gate could therefore only time out — a mechanism with no reachable consumer.
//   F-86b  `render` at awaiting-editor was refused `VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING` ("both members' evidence
//          lists are empty"), while the teaching's own `part` example carried NO evidence field: the requirement was
//          real, machine-enforced, and invisible where a writer would look.
//   F-87a  `vibe_v5_set { key: "vmu.meetings.verdictMaxRounds", value: 2 }` answered `applied: "next-session"` /
//          `requiresRestart: true` / `constructionOnly: "createMeetings() snapshots the whole vmu.meetings.* block"`,
//          while the RULE (L44) says the ACADEMICIAN decides how many rounds a debate gets. The one decision the rule
//          assigns to the chair was adjustable only by restarting the institute.
//
// WHAT THIS SUITE PROVES: (1) the round ceiling is re-read on every motion, so a mid-session write takes effect at the
// NEXT motion; (2) the settings receipt reports that live reader by name instead of "restart"; (3) the family rule for
// `vmu.meetings.*` still holds for the keys that ARE construction-only; (4) the declared consult role survives the seat
// gate (and an unknown id still gets VMU_NO_SUCH_OBJECT); (5) the teaching names evidence as part of a part and the
// declared-role shape of an office answer.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

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
const { LIVE_READERS_EXACT, constructionOnlyReasonOf } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js')).href)

const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'] }, config))
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const callJSON = async (b, name, args = {}, ctx = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, ctx) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
}

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r87-')); roots.push(d); return d }

// ── §1 the two declarations (exact reader wins over the family rule; the family still holds elsewhere) ──────────
{
  console.log('§1 the round ceiling is a NAMED live reader, and the family rule still binds the rest')
  ok(Object.keys(LIVE_READERS_EXACT).includes('vmu.meetings.verdictMaxRounds'), 'LIVE_READERS_EXACT names vmu.meetings.verdictMaxRounds')
  ok(String(LIVE_READERS_EXACT['vmu.meetings.verdictMaxRounds']).includes('kernel/meetings'), 'the named reader says WHERE it is read')
  ok(constructionOnlyReasonOf('vmu.meetings.verdictMaxRounds') === null,
    'constructionOnlyReasonOf() no longer calls the round ceiling construction-only', constructionOnlyReasonOf('vmu.meetings.verdictMaxRounds'))
  const family = constructionOnlyReasonOf('vmu.meetings.quorumRule')
  ok(typeof family === 'string' && family.length > 0, 'the FAMILY rule still binds a key with no live reader', family)
}

// ── §2 mid-session write reaches the next motion ────────────────────────────────────────────────────────────────
{
  console.log('§2 a mid-session write to the ceiling takes effect at the NEXT motion')
  const root = await mkRoot()
  const b = await boot({ root, 'vmu.meetings.verdictMaxRounds': 1 })
  const k = b.handle.kernel
  await k.members.hire({ id: 'r-acad', slot: 'chair' })
  await k.members.hire({ id: 'r-1', slot: 'member' })
  const opened = k.meetings.open({ type: 'ordinary', chair: 'r-acad', actor: 'r-acad', roster: ['r-acad', 'r-1'] })
  const mid = opened.meeting
  const m1 = k.meetings.motion({ meeting: mid, member: 'r-acad', kind: 'ordinary', text: 'first' })
  ok(m1 && m1.receipt && m1.receipt.motion, 'first motion recorded under a cap of 1', m1)
  const second = (() => { try { return k.meetings.motion({ meeting: mid, member: 'r-acad', kind: 'ordinary', text: 'second' }) } catch (e) { return e } })()
  ok(second instanceof Error && second.code === 'VMU_RESOURCE_BUDGET', 'the second motion is refused at the ceiling of 1', second && second.code)
  ok(second instanceof Error && String(second.message).includes('1 / 1'), 'the refusal names the measured ratio 1 / 1', second && second.message)

  const wrote = k.setSettingsValue('vmu.meetings.verdictMaxRounds', 2, { by: 'role:chair', reason: 'this debate gets a second round' })
  ok(wrote && (wrote.requiresRestart !== true), 'the receipt does NOT claim a restart is required', wrote)
  ok(wrote && (wrote.constructionOnly === null || wrote.constructionOnly === undefined),
    'the receipt does NOT call the key construction-only', wrote && wrote.constructionOnly)
  const live = JSON.stringify(wrote || {})
  ok(live.includes('kernel/meetings'), 'the receipt names the live reader (kernel/meetings)', wrote)

  const m2 = k.meetings.motion({ meeting: mid, member: 'r-acad', kind: 'ordinary', text: 'second round' })
  ok(m2 && m2.receipt && m2.receipt.motion === 'mo2', 'the very next motion succeeds after the write', m2 && m2.receipt && m2.receipt.motion)
  const third = (() => { try { return k.meetings.motion({ meeting: mid, member: 'r-acad', kind: 'ordinary', text: 'third' }) } catch (e) { return e } })()
  ok(third instanceof Error && third.code === 'VMU_RESOURCE_BUDGET' && String(third.message).includes('2 / 2'),
    'the ceiling moved to 2: the third motion is refused with 2 / 2', third && third.message)
  ok(third instanceof Error && String(third.hint || '').includes('mid-session'), 'the refusal hint says the chair may raise it mid-session', third && third.hint)
  await rm(root, { recursive: true, force: true, maxRetries: 10 })
}

// ── §3 the declared consult role survives the seat gate; an unknown id still does not ──────────────────────────
{
  console.log('§3 the office answers its own consult without a roster seat')
  const root = await mkRoot()
  const b = await boot({ root, 'vmu.paper.officeConsult': 'required' })
  const k = b.handle.kernel
  await k.members.hire({ id: 'r-1', slot: 'member' })
  const ctx = { kernel: k }
  const office = await callJSON(b, 'vibe_v5_paper', { action: 'consult', target: 'p-none', member: 'office', answer: 'ok', request_id: 'rq-x' }, ctx)
  const officeCode = office.parsed && office.parsed.code
  ok(!(officeCode === 'VMU_NO_SUCH_OBJECT' && String(office.parsed && office.parsed.message).includes('office')),
    'consult { member: "office" } is NOT refused for being off the roster', office.parsed || office)
  ok(office.parsed && (office.parsed.code === 'VMU_PACK_V5R_CORE_PAPER_STATE' || office.parsed.ok === true),
    'it gets past the seat gate and fails on the PAPER (or succeeds), not on the roster', office.parsed && office.parsed.code)
  const started = await callJSON(b, 'vibe_v5_paper', { action: 'start', target: 'p-1', participants: ['r-1'] }, ctx)
  ok(started.parsed && started.parsed.ok === true, 'a paper can be started for the seat-gate checks', started.parsed && started.parsed.started)
  const stranger = await callJSON(b, 'vibe_v5_paper', { action: 'consult', target: 'p-1', member: 'r-ghost', answer: 'ok' }, ctx)
  ok(stranger.parsed && stranger.parsed.code === 'VMU_NO_SUCH_OBJECT', 'an id that is neither a seat nor a declared role is still refused', stranger.parsed || stranger)
  const asMember = await callJSON(b, 'vibe_v5_paper', { action: 'consult', target: 'p-1', member: 'r-1', answer: 'ok' }, ctx)
  ok(asMember.parsed && asMember.parsed.code === 'VMU_NOT_PERMITTED', 'a seated member who is not a declared consult role is refused as not permitted', asMember.parsed || asMember)
  await rm(root, { recursive: true, force: true, maxRetries: 10 })
}

// ── §4 the teaching states the requirement where the writer looks ───────────────────────────────────────────────
{
  console.log('§4 teaching: evidence is part of a part, and the office answers by declared role')
  const { v5rPaperWriteSection } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-paper-prompts.js')).href)
  const text = v5rPaperWriteSection.text
  ok(text.includes('evidence: ["Members/'), 'the `part` example carries an evidence list', text.includes('evidence:'))
  ok(text.includes('VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING'), 'the text names the refusal a missing evidence list causes')
  ok(text.includes('declared-role'), 'the text states how the office answers (declared-role), not as a seat')
  const { CHARTER_BLOCKS_B } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-blocks-b.js')).href)
  ok(Array.isArray(CHARTER_BLOCKS_B) && CHARTER_BLOCKS_B.length >= 5, 'sanity: the blocks module exposes its sections', Array.isArray(CHARTER_BLOCKS_B) ? CHARTER_BLOCKS_B.length : null)
}

console.log('\nVMU RUN 86/87 ROUND CAP + CONSULT: ' + passed + ' passed, ' + failed + ' failed')
for (const d of roots) { try { await rm(d, { recursive: true, force: true, maxRetries: 10 }) } catch { /* best effort */ } }
if (failed) { console.error('FAILURES:\n - ' + failures.join('\n - ')); process.exit(1) }
