// tests/vmu-run242-feedback65.test.mjs — RUN 242 / FEEDBACK65 (the 65th live run's eight mechanism findings).
//
// WHAT RUN 65 MEASURED (SIM-REPORT65.md / FEEDBACK65.md), and what this suite holds:
//   1.1 a turn whose DELIVERY THREW stayed at status "open" in `turnReceipts` while `deliveryLastFail` said
//       VMU_TURN_DELIVERY_TIMEOUT and `turnLoop.inFlight` said false - three readings of one fact, two of them wrong;
//   1.2 `lastAttribution` denied any delivery had returned AND named a member, with no `turn` key at all (half a stamp);
//   1.3 `abandonAfterMs` (25 min) sat ABOVE the delivery seam's own budget (18.75 min), so the backstop could never fire
//       in that deployment while the reading implied it would;
//   1.4 `recover`'s PLAN printed `members:0` for "the plan has not read the seam yet" - the exact shape of "the roster is
//       empty";
//   1.5 the VMU_RECORD_SETTLEMENT_REWRITE refusal carried none of the three body keys (silence read as a promise);
//   1.6 a merge that dropped nothing omitted `bodyOwnIdLineDropped` entirely, so "the rule did not fire" and "the rule is
//       not implemented" looked the same;
//   1.7 `reply` judged the REPORT's shape before asking whether a turn was open, so the deeper refusal was hidden.
//
// Run: node tests/vmu-run242-feedback65.test.mjs   (last line: === VMU RUN 242 FEEDBACK65: N passed, M failed ===)

import { mkdtemp } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createTurnOrchestrator } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { v5rPromptSections } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { decideSections as DECIDE_SECTIONS } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'
import { createResume } from '../vibe-math-vmu/kernel/resume.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href
const read = (rel) => readFileSync(join(REPO, rel), 'utf8')
const TURN_SRC = read('vibe-math-vmu/kernel/turn/index.js')
const TURN_TOOL_SRC = read('vibe-math-vmu/tools/turn.js')
const RESUME_SRC = read('vibe-math-vmu/kernel/resume.js')
const RECORDS_SRC = read('vibe-math-vmu/kernel/records.js')
const V5R_TOOLS_SRC = read('vibe-math-vmu/packs/v5r/tools.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; failures.push(label); console.log('  FAIL ' + label + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 300) + ']')) }
}
const has = (hay, needle, label) => ok(String(hay === undefined || hay === null ? '' : hay).includes(needle), label, hay)
const pipeline = () => createPromptPipeline({ sections: v5rPromptSections, clock: () => '2026-01-01T00:00:00.000Z' })
const entry = await import(ENTRY)

const roots = []
const boot = async (settings = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'vmu-r242-f65-'))
  roots.push(root)
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ root, packs: ['v5r'], clock: () => 1000, deliverMode: 'caller' }, settings))
  await handle.ready()
  const kernel = handle.kernel
  await kernel.members.hire({ id: 'r-chair', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  return { root, kernel, specs: state.specs }
}
const TOOL = (specs, name) => specs.find((s) => s.name === name)
const parse = (res) => (typeof res === 'string' ? JSON.parse(res) : res)
const call = async (specs, name, args) => {
  const spec = TOOL(specs, name)
  if (!spec) return { ok: false, code: 'NO_SUCH_TOOL', message: name }
  try { return parse(await spec.execute(args, {})) } catch (e) {
    return { ok: false, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
}
const show = (r) => (r && (r.code || '') + ' ' + String((r && r.message) || '').slice(0, 160)).trim()
function seedVotingBallot(kernel, tag) {
  const box = kernel.ballotbox.open({ question: tag + ' 是否成立', options: ['1', '0'], rules: { minVotes: 0 } })
  const id = String(box.boxId === undefined ? box.id : box.boxId)
  kernel.ballotbox.cast({ boxId: id, by: 'r-1', choice: '1' })
  return id
}

// ── §0 the source says what the receipts claim ────────────────────────────────────────────────────────────────
has(TURN_SRC, "noteTurnReceipt(turn, {\n          status: 'undelivered',", '§0a ★★★ a delivery that THREW closes its own row (run 65 left it at "open")')
has(TURN_SRC, "closedWith: threwCode", '§0b ★★ and the row names the CODE that closed it')
has(TURN_SRC, "settledBy: 'delivery-threw'", '§0c ★★ and says what kind of settling that was (not "failed": the member never answered)')
has(TURN_SRC, 'writesWindow: {', '§0d ★★★ the failed delivery names the WINDOW a reader must scan before concluding the member did nothing')
has(TURN_SRC, 'enumerated: false', '§0e ★★ and says the receipt cannot enumerate that window itself (the member writes in its own kernel)')
has(TURN_SRC, "slot: lastAttribution && typeof lastAttribution.member === 'string' ? 'single' : 'empty'", '§0f ★★★ the attribution slot is stamped WHOLE or reports itself empty')
has(TURN_SRC, 'attemptedMember:', '§0g ★★ the member a delivery was ATTEMPTED for is named as an attempt, not as the last delivery')
has(TURN_SRC, 'const DELIVERY_TIMEOUT_MS = (() => {', '§0h ★★ the seam\'s own timeout is now a number the loop knows')
has(TURN_SRC, 'deliverySeamBudgetMs: SEAM_BUDGET_MS', '§0i ★★★ turnLoop publishes BOTH timeouts and the order between them')
has(TURN_SRC, "timeoutOrder: ABANDON_AFTER_MS > SEAM_BUDGET_MS ? 'backstop-after-seam' : 'backstop-before-seam'", '§0j ★★ and which one will fire first')
has(TURN_SRC, 'reportChannel: () => {', '§0k ★★ a face can ask "is there a turn to answer?" without filing a report')
has(TURN_TOOL_SRC, 'kernel.turn.reportChannel()', '§0l ★★★ the face asks that question BEFORE judging the report\'s shape (FEEDBACK65 1.7)')
has(RESUME_SRC, "membersWhy: 'the plan has no roster seam to read", '§0m ★★★ a plan that read no roster says `members:null` with a reason, never 0')
has(V5R_TOOLS_SRC, 'settledRefusal.bodyModeUsed = \'refused\'', '§0n ★★ the settlement refusal says the body stage was NOT REACHED')
has(V5R_TOOLS_SRC, "'NOT PROCESSED: this write was refused before the body stage", '§0o ★★ and spells out that null means "not reached", not "nothing was lost"')
has(RECORDS_SRC, 'reported as false rather than omitted', '§0p ★ the body-own-id rule reports false instead of omitting itself')

// ── §1 1.1 the row closes itself when the delivery throws ────────────────────────────────────────────────────
{
  const boom = async () => { const e = new Error('the seam gave up waiting'); e.code = 'VMU_TURN_DELIVERY_TIMEOUT'; e.stillRunning = true; throw e }
  const t = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), deliver: boom })
  let threw = null
  try { await t.run({ member: 'r-1', phase: 'normal' }) } catch (e) { threw = e }
  ok(!!threw && threw.code === 'VMU_TURN_DELIVERY_TIMEOUT', '§1a premise: the delivery seam threw a named timeout', threw && threw.code)
  const st = t.status()
  const rows = Array.isArray(st.turnReceipts) ? st.turnReceipts : []
  ok(rows.length === 1, '§1b exactly one turn row exists (non-vacuous: ' + rows.length + ')', rows.length)
  const row = rows[0] || {}
  ok(row.status === 'undelivered', '§1c ★★★ the row no longer claims to be "open" after its delivery threw', row)
  ok(row.closedWith === 'VMU_TURN_DELIVERY_TIMEOUT', '§1d ★★★ and it carries the code that closed it (one fact, one place)', row.closedWith)
  ok(row.settledBy === 'delivery-threw', '§1e ★★ and how it was settled, so "undelivered" is not a word without a definition', row.settledBy)
  const fail = st.counts && st.counts.deliveryLastFail
  ok(!!fail && !!fail.writesWindow && typeof fail.writesWindow.means === 'string' && fail.writesWindow.means.length > 40,
    '§1f ★★★ the failure names the window in which the child may have written, with what that means', fail && fail.writesWindow)
  ok(!!fail && fail.writesWindow && fail.writesWindow.enumerated === false && fail.writesWindow.by === 'r-1',
    '§1g ★★ and is honest that this receipt cannot enumerate it (the member writes in its own kernel)', fail && fail.writesWindow)
  ok(t.turnLoop().inFlight === false, '§1h and the lock is free again (the throw released it)')
}

// ── §2 1.2 the slot is stamped whole, or says it is empty ────────────────────────────────────────────────────
{
  const t = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), deliver: async () => { const e = new Error('never came back'); e.code = 'VMU_TURN_DELIVERY_TIMEOUT'; throw e } })
  const fresh = t.status().lastAttribution || {}
  ok(fresh.member === null || fresh.member === undefined, '§2a ★★★ a fresh loop names NO member as the last delivery', fresh)
  ok(fresh.slot === 'empty', '§2b ★★ the slot reports itself EMPTY rather than half-filled (FEEDBACK65 1.2)', fresh.slot)
  try { await t.run({ member: 'r-1', phase: 'normal' }) } catch { /* the attempt is the point */ }
  const after = t.status().lastAttribution || {}
  ok(after.member === null || after.member === undefined, '§2c ★★★ an attempt that never returned is still not a delivery: member stays null', after)
  ok(after.turn === null || after.turn === undefined, '§2d ★★ and no turn is named either (the two keys move together)', after.turn)
  ok(after.attemptedMember === 'r-1', '§2e ★★ the member it was ATTEMPTED for is reported under its own key', after.attemptedMember)
  ok(typeof after.attemptedMemberMeans === 'string' && after.attemptedMemberMeans.length > 30,
    '§2f and that key says it is an attempt, not a claim about the last delivery', after.attemptedMemberMeans)
}

// ── §3 1.3 both timeouts, and which one fires first ──────────────────────────────────────────────────────────
{
  const t = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), deliver: async () => 'x' })
  const loop = t.turnLoop()
  ok(Number.isFinite(loop.deliveryTimeoutMs) && loop.deliveryTimeoutMs > 0, '§3a ★★ turnLoop publishes the delivery seam\'s own timeout', loop.deliveryTimeoutMs)
  ok(Number.isFinite(loop.deliverySeamBudgetMs) && loop.deliverySeamBudgetMs > loop.deliveryTimeoutMs,
    '§3b ★★ and the seam\'s real budget (timeout + grace) beside it', { t: loop.deliveryTimeoutMs, b: loop.deliverySeamBudgetMs })
  ok(loop.abandonAfterMs > loop.deliverySeamBudgetMs && loop.timeoutOrder === 'backstop-after-seam',
    '§3c ★★★ the two numbers are ORDERED and the order is named (run 65 read a backstop that could never fire)', { abandon: loop.abandonAfterMs, seam: loop.deliverySeamBudgetMs, order: loop.timeoutOrder })
  ok(typeof loop.timeoutOrderMeans === 'string' && /never reached/.test(loop.timeoutOrderMeans),
    '§3d ★★ and the reading says the backstop is not "how long a caller must wait"', loop.timeoutOrderMeans && loop.timeoutOrderMeans.slice(0, 120))
}

// ── §4 1.4 a plan that read no roster does not print a zero ─────────────────────────────────────────────────
{
  const data = new Map()
  const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))
  const store = {
    export: () => ({ version: 1, keys: Object.fromEntries(data) }),
    read: (k) => copy(data.get(k)),
    patch: (k, fn) => { const next = fn(copy(data.get(k))); data.set(k, next); return { ok: true, key: k } },
  }
  const r = createResume({ store, clock: () => 1000 })
  await r.read()
  const plan = r.recoverPlan({ reason: 'r242-plan' })
  const steps = Array.isArray(plan.steps) ? plan.steps : []
  ok(steps.length > 0, '§4a the plan has steps (non-vacuous: ' + steps.length + ')', steps.length)
  const roster = steps.find((s) => s && s.step === 'roster') || {}
  ok(roster.ok === false, '§4b premise: with no roster seam the step is not ok', roster)
  ok(roster.members === null, '§4c ★★★ a seat count nobody read is null, NOT 0 (run 65 read 0 beside four live seats)', roster.members)
  ok(typeof roster.membersWhy === 'string' && roster.membersWhy.length > 30,
    '§4d ★★ and the reason travels with it, so null cannot be read as "zero seats"', roster.membersWhy)
}

// ── §5 1.5 the settlement refusal says where it stopped ─────────────────────────────────────────────────────
{
  const b = await boot()
  // ★ the card must be SETTLED but NOT locked: a complete proof turns on the L14 finality lock, which refuses any
  // later write with VMU_STATE before the settlement rule is ever consulted (that lock has its own suites). Leaving the
  // card at `draft` keeps this fixture about the one gate it is testing.
  const card = await call(b.specs, 'vibe_v5_record_proposition', {
    id: 'rec-242-g5', statement: 'run242 §5 命题：n+n=2n', value: 1, motive: '算术恒等', p: 0.99,
    proof_state: 'draft', member: 'r-1', title: 'run242 结算卡',
  })
  ok(card.ok === true, '§5a premise: the card is written', show(card))
  const settled = await call(b.specs, 'vibe_v5_record_proposition', {
    id: 'rec-242-g5', statement: 'run242 §5 命题：n+n=2n', value: 1, motive: '算术恒等', p: 1,
    debate_ruling: { subject: 'rec-242-g5', value: 1, mode: 'unanimous', n: 2, decided: true, ballotId: seedVotingBallot(b.kernel, 'r242-5'), by: 'r-chair' }, member: 'r-1',
  })
  ok(settled.ok === true && settled.settled === true, '§5b premise: the card is settled at p=1', show(settled))
  const refused = await call(b.specs, 'vibe_v5_record_proposition', {
    id: 'rec-242-g5', statement: 'run242 §5 命题：n+n=2n', value: 1, motive: '算术恒等', p: 0, member: 'r-1',
  })
  ok(refused.ok === false && refused.code === 'VMU_RECORD_SETTLEMENT_REWRITE',
    '§5c ★★★ a plain write that would un-settle the card is refused by name', show(refused))
  ok(refused.bodyModeUsed === 'refused', '§5d ★★★ and the refusal says the body stage was NOT REACHED', refused.bodyModeUsed)
  ok(refused.bodyLinesDropped === null && refused.bodyLinesAdded === null,
    '§5e ★★ with explicit nulls, so "not reached" and "nothing lost" cannot look the same', { d: refused.bodyLinesDropped, a: refused.bodyLinesAdded })
  ok(typeof refused.bodyLinesMeans === 'string' && /NOT PROCESSED/.test(refused.bodyLinesMeans),
    '§5f ★★ and the sentence a reader needs to tell those two apart', refused.bodyLinesMeans)
}

// ── §6 1.6 "the rule did not fire" is a VALUE ────────────────────────────────────────────────────────────────
{
  const b = await boot()
  const created = await call(b.specs, 'vibe_v5_record_proposition', {
    id: 'rec-242-g6', statement: 'run242 §6 命题', value: 1, motive: '口径', p: 0.4, member: 'r-1', title: 'run242 merge 卡',
  })
  ok(created.ok === true, '§6a premise: a card exists', show(created))
  const merged = await call(b.specs, 'vibe_v5_record_proposition', {
    id: 'rec-242-g6', statement: 'run242 §6 命题', value: 1, motive: '口径（改）', p: 0.4, member: 'r-1', bodyMode: 'merge',
  })
  ok(merged.ok === true && merged.updated === true, '§6b premise: a merge write succeeds', show(merged))
  ok(merged.bodyOwnIdLineDropped === false,
    '§6c ★★★ the body-own-id rule reports FALSE rather than omitting itself (run 65 had no such key at all)', merged.bodyOwnIdLineDropped)
  ok(typeof merged.bodyOwnIdLineMeans === 'string' && merged.bodyOwnIdLineMeans.length > 40,
    '§6d ★★ and says the rule did not fire here (a value, not silence)', merged.bodyOwnIdLineMeans && merged.bodyOwnIdLineMeans.slice(0, 140))
  // The positive case is measured where the rule LIVES (the kernel's own storage boundary): a body that names its row.
  const row = b.kernel.records.get({ id: 'rec-242-g6' })
  const meta = (row && (row.record || row)) || {}
  const own = b.kernel.records.put({
    id: 'rec-242-g6', track: meta.track, kind: meta.kind, title: meta.title || 'run242 merge 卡',
    body: '- id：rec-242-g6\n- note：正文里写了自己的 id', by: 'r-1', bodyMode: 'merge',
  })
  ok(own && own.ok === true, '§6e premise: a write whose body names the row\'s own id is accepted', show(own))
  ok(own.bodyOwnIdLineDropped === true,
    '§6f ★★ and THAT case reports true, so the flag can move in both directions (a guard that cannot turn red is not a guard)', own.bodyOwnIdLineDropped)
}

// ── §7 1.7 which question comes first ───────────────────────────────────────────────────────────────────────
{
  const b = await boot()
  const chan = typeof b.kernel.turn.reportChannel === 'function' ? b.kernel.turn.reportChannel() : null
  ok(chan !== null && chan.open === false, '§7a ★★ the channel reports "no turn to answer" before any report exists', chan)
  const reply = await call(b.specs, 'vibe_vmu_turn', { op: 'reply', reply_for: 'r-1' })
  ok(reply.ok === false && reply.code === 'VMU_TURN_NO_PENDING_MEMBER',
    '§7b ★★★ a report-less call now hears the DEEPER reason (no turn to answer), not "report is missing or empty"', show(reply))
  ok(typeof reply.hint === 'string' && /CHANNEL/.test(reply.hint),
    '§7c ★★ and still gets the long channel hint that says the delegated path can never open it', reply.hint && reply.hint.slice(0, 120))
}

// ── §8 A7 the meeting frame is not printed when no meeting is bound ──────────────────────────────────────────
// The prompt audit (docs/acceptance/sim-audit-prompts.md A7) found the meeting frame rendering an EMPTY heading on turns
// that had read no meeting: the phase gate was `phase === 'meeting'`, and a member can be in that phase with no meeting
// bound (run 65's t-3 was exactly that). The fix is a second scope dimension, `meetingId: 'required'`, judged on the
// meeting the TURN actually carries. Asserted here at the level that decides it - which sections are assembled.
{
  const PROMPT_SRC = read('vibe-math-vmu/kernel/prompt/index.js')
  const BLOCKS_B_SRC = read('vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js')
  ok(/scope\.meetingId === 'required' && !\(typeof ctx\.meeting === 'string' && ctx\.meeting\.trim\(\) !== ''\)/.test(PROMPT_SRC),
    '§8a ★★★ the section scope knows a meeting-bound dimension and judges it on ctx.meeting, not on the rendered template',
    (PROMPT_SRC.match(/scope\.meetingId === 'required'[^\n]{0,120}/) || [''])[0])
  ok(/meeting: typeof turn\.meeting === 'string' && turn\.meeting\.trim\(\) !== '' \? turn\.meeting\.trim\(\) : null/.test(TURN_SRC),
    '§8b ★★ the turn hands the assembly the meeting it is actually bound to', '')
  ok(/name: 'v5r-turn-meeting-agenda'[\s\S]{0,600}?meetingId: 'required'/.test(BLOCKS_B_SRC),
    '§8c ★★ the meeting frame section carries the gate', '')
  ok(/name: 'v5r-turn-meeting-chamber'[\s\S]{0,2500}?meetingId: 'required'/.test(BLOCKS_B_SRC),
    '§8d ★★ and so does the chamber section', '')

  // BEHAVIOUR: assemble the SAME phase twice, once unbound and once bound, and compare which sections were selected.
  const { charterSections } = await import('../vibe-math-vmu/packs/v5r/prompts/v5r-charter.js')
  const pipeline = createPromptPipeline({
    sections: charterSections({ hasLeader: true }),
    sectionPolicy: DECIDE_SECTIONS,
    clock: () => '2026-01-01T00:00:00.000Z',
  })
  const base = { member: 'r-1', role: 'academician', phase: 'meeting', meetingState: 'first' }
  const unboundOut = await pipeline.assemble({ ...base, meeting: null })
  const boundOut = await pipeline.assemble({ ...base, meeting: 'm1' })
  const names = (out) => (out.sources || []).map((s) => s.section)
  const unbound = names(unboundOut)
  const bound = names(boundOut)
  ok(unbound.indexOf('v5r-turn-meeting-agenda') === -1 && unbound.indexOf('v5r-turn-meeting-chamber') === -1,
    '§8e ★★★ in the meeting PHASE with no meeting bound, neither meeting-only section is selected (run 65 printed theirs)',
    show(unbound.filter((n) => /meeting-agenda|meeting-chamber/.test(n))))
  ok(bound.indexOf('v5r-turn-meeting-agenda') !== -1 && bound.indexOf('v5r-turn-meeting-chamber') !== -1,
    '§8f ★★★ and with a meeting bound both ARE selected, so the gate is a gate and not a wall', show(bound.filter((n) => /meeting-agenda|meeting-chamber/.test(n))))
  // §8g the RULER must bind a meeting too. The budget gate assembles its own context; if it kept assembling the meeting
  // phase with no meeting, it would measure a prompt no seat receives (it did exactly that until RUN 242, which is why
  // the chair cap had to move only after the ruler was fixed).
  const budgetSrc = readFileSync(new URL('../scripts/audit-prompt-budget.mjs', import.meta.url), 'utf8')
  ok(budgetSrc.includes("meeting: phase === 'meeting' ? 'm-budget' : null"),
    '§8g the prompt-budget ruler BINDS a meeting for the meeting phase (else it measures a floor nobody is on)')
  // §8h and the chair cap has to be at least the measurement the fixed ruler produces, or the gate is red for a
  // number that was never measured. Both halves in one place: a cap below the real prompt and a ruler without a
  // meeting are the same bug seen from two sides.
  const capMatch = /chairPromptChars: (\d+)/.exec(budgetSrc)
  ok(capMatch !== null && Number(capMatch[1]) >= 36388,
    '§8h the chair cap covers the measured chair/meeting prompt (36 388 chars on this tree)', capMatch && capMatch[1])
}

for (const r of roots) { try { await mkdtemp(join(tmpdir(), 'x')) } catch { /* ignore */ } }
console.log('')
console.log('=== VMU RUN 242 FEEDBACK65: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f) }
