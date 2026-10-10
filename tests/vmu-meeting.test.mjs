// vmu meeting — the capability scenario for kernel/meeting.js (docs/08 §2).
//
// The scenario is the s8-freeze-say failure mode, turned into a permanent regression:
//   · a REFUSED input must leave `inputs` untouched and must leave the member PENDING, so a refusal can
//     never move the meeting towards "done";
//   · therefore `close()` on an incomplete round is REFUSED by name - the early close that v5r suffered
//     is now impossible without an explicit, audited `force`;
//   · `roundComplete` is a pluggable predicate, so a pack can say "frozen means never complete" and the
//     meeting then simply cannot advance (policy outside the kernel);
//   · a question without an ask seam is refused by name, and an accepted input is the ONLY thing that
//     marks a member answered.
//
// `--self-probe` copies the module and makes `refuseInput` COUNT the refused input (the v5r bug), then
// requires the regression assertion to fail.

import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const MODULE = resolve(REPO, 'vibe-math-vmu', 'kernel', 'meeting.js')
const SELF_PROBE = process.argv.includes('--self-probe')

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const expectThrow = async (fn, code, name) => {
  try { await fn(); failed++; failures.push(name + ' (did not throw)') }
  catch (e) { ok(e && e.code === code, name, e && e.code) }
}

const m = await import(pathToFileURL(MODULE).href)
const roster = ['r-1', 'r-2']
const mk = (opts = {}) => m.createMeeting(Object.assign({
  id: 'mt-1', kind: 'review', roster, deliver: async () => {}, clock: () => '2026-10-09T00:00:00.000Z',
}, opts))

// ---- 1. convene discipline ---------------------------------------------------------------------
{
  await expectThrow(() => mk({ roster: [] }).convene('x'), 'VMU_MEETING_TOO_SMALL', 'a one-or-zero member meeting is refused by name')
  const small = mk({ roster: ['r-1'] })
  await expectThrow(() => small.convene('x'), 'VMU_MEETING_TOO_SMALL', 'the default roster rule needs two participants')
  const m2 = mk()
  await m2.convene('review the locked results')
  await expectThrow(() => m2.convene('again'), 'VMU_STATE', 'convening twice is refused')
  ok(m2.status().state === 'convened' && m2.summary().agenda === 'review the locked results', 'the agenda is recorded')
  const custom = mk({ canConvene: () => ({ ok: false, code: 'VMU_NOT_PERMITTED', message: 'not yet' }) })
  await expectThrow(() => custom.convene('x'), 'VMU_NOT_PERMITTED', 'a refusing canConvene blocks the convening')
  ok(custom.status().state === 'idle' && custom.history().some((h) => h.what === 'convene-refused'), 'a refused convening changes no state but is audited')
}

// ---- 2. rounds, the ask seam, and accepted inputs ---------------------------------------------
{
  const asked = []
  const withSeam = mk({ deliver: async (env) => { asked.push(env) } })
  await withSeam.convene('review')
  await withSeam.openRound({ ask: 'your verdict?' })
  ok(asked.length === 2, 'the ask seam is called once per asked member', asked.length)
  ok(asked[0].member === 'r-1' && asked[0].ask === 'your verdict?' && asked[0].round === 1, 'the envelope names member, round and question')
  const noSeam = mk({ deliver: null })
  await noSeam.convene('review')
  await expectThrow(() => noSeam.openRound({ ask: 'x' }), 'VMU_ENGINE_UNAVAILABLE', 'a question without an ask seam is refused by name')
  await noSeam.openRound({}) // no question: allowed (a round can simply collect inputs)
  ok(noSeam.status().state === 'in_session', 'a question-less round opens without a seam')

  await withSeam.speak('r-1', 'looks fine')
  ok(withSeam.status().answered === 1 && withSeam.summary().unreached.join(',') === 'r-2', 'an accepted input marks the member answered')
  await expectThrow(() => withSeam.speak('r-2', '   '), 'VMU_INVALID_ARGUMENT', 'an empty input is refused')
  await expectThrow(() => withSeam.speak('r-9', 'x'), 'VMU_NOT_PERMITTED', 'a member who was not asked is refused')
}

// ---- 3. THE REGRESSION: a refused input is not an input (s8-freeze-say) ------------------------
{
  let frozen = true // the pack's policy, not a kernel concept: freezing belongs to the ballot
  const meeting = mk({ roundComplete: ({ inputs, silent, asked }) => {
    if (frozen) return { complete: false, reason: 'the ballot is frozen' }
    const pending = asked.filter((x) => !inputs[x] && !silent[x])
    return { complete: pending.length === 0, reason: pending.length ? 'waiting on ' + pending.join(',') : 'done', pending }
  } })
  await meeting.convene('review')
  await meeting.openRound({ ask: 'verdict?' })
  await meeting.speak('r-1', 'fine')

  const before = JSON.stringify(meeting.summary().inputs)
  const refusal = meeting.refuseInput('r-2', 'I would say something', 'in-frozen-ballot')
  ok(refusal.counted === false && refusal.stillPending.join(',') === 'r-2', 'the refusal reports that it is NOT counted and r-2 is still pending')
  ok(JSON.stringify(meeting.summary().inputs) === before, 'the refused input left `inputs` byte-identical (it is not an input)')
  ok(meeting.roundComplete().complete === false, 'the round is NOT complete after a refusal')
  ok(meeting.summary().rounds[0].refused.length === 1, 'the refusal is recorded in the round as a refusal, separately from answers')
  await expectThrow(() => meeting.close('wrap up'), 'VMU_STATE',
    'closing an incomplete round is REFUSED (the early close is impossible without force)')
  ok(meeting.status().state === 'in_session', 'the refused close left the meeting in session')

  // The legitimate way out: the freeze lifts and the member answers (or is explicitly marked silent).
  frozen = false
  await meeting.speak('r-2', 'fine too')
  ok(meeting.roundComplete().complete === true, 'once everyone answered the round completes')
  const closed = await meeting.close('wrap up')
  ok(closed.ok === true && closed.forced === false && meeting.status().state === 'closed', 'a complete round closes normally')
}

// ---- 4. silence IS terminal; forcing a close is explicit and audited ---------------------------
{
  const meeting = mk()
  await meeting.convene('review')
  await meeting.openRound({ ask: 'x', members: roster })
  await meeting.speak('r-1', 'fine')
  await meeting.markSilent('r-2', 'nothing to add')
  ok(meeting.roundComplete().complete === true, 'silence is a terminal state, not a missing input')
  ok((await meeting.close('done')).ok === true, 'a round with one answer and one silence closes normally')

  const forced = m.createMeeting({ id: 'mt-2', roster, deliver: async () => {} })
  await forced.convene('urgent')
  await forced.openRound({ ask: 'x' })
  await forced.speak('r-1', 'fine')
  const r = await forced.close('out of time', { force: true, by: 'office' })
  ok(r.forced === true && r.complete === false, 'a forced close reports that it was forced')
  const rec = forced.history().find((h) => h.what === 'close-forced')
  ok(rec && rec.by === 'office' && rec.pending.join(',') === 'r-2', 'the forced close names who forced it and what was pending')
}

// ---- 5. pluggable rules: the pack decides, the kernel only asks -------------------------------
{
  const permissive = mk({ roundComplete: () => ({ complete: true, reason: 'the pack says the round is done' }) })
  await permissive.convene('review')
  await permissive.openRound({ ask: 'x' })
  ok((await permissive.close('done')).ok === true, 'a pack rule may declare a round complete early (policy outside)')
  const vetoed = mk({ closePolicy: () => ({ ok: false, code: 'VMU_STATE', message: 'this meeting must be closed by the chair' }) })
  await vetoed.convene('review')
  await vetoed.openRound({})
  await expectThrow(() => vetoed.close('x'), 'VMU_STATE', 'a refusing closePolicy blocks the close')
  ok(vetoed.history().some((h) => h.what === 'close-refused'), 'the blocked close is audited')
  const hands = mk({ handPolicy: ({ hands: h }) => (h.length >= 1 ? { ok: false, code: 'VMU_NOT_PERMITTED', message: 'one hand at a time' } : { ok: true }) })
  await hands.convene('review')
  await hands.openRound({})
  ok((await hands.handUp('r-1')).ok === true, 'the default hand policy accepts')
  const second = await hands.handUp('r-2')
  ok(second.ok === false && second.refused.message === 'one hand at a time', 'a custom hand policy refuses with its own message')
}

// ---- 6. round bookkeeping and state discipline -------------------------------------------------
{
  const meeting = mk()
  await expectThrow(() => meeting.openRound({}), 'VMU_STATE', 'a round cannot open before convening')
  await meeting.convene('review')
  await expectThrow(() => meeting.speak('r-1', 'x'), 'VMU_STATE', 'no input outside a round')
  await meeting.openRound({ ask: 'a', members: roster })
  await meeting.speak('r-1', 'x')
  await meeting.markSilent('r-2')
  await meeting.close('round 1 done')
  const s = meeting.summary()
  ok(s.rounds.length === 1 && s.rounds[0].answered.join(',') === 'r-1', 'the round records answers per member')
  ok(meeting.status().refused === 0, 'a clean round has no refusals')
  await expectThrow(() => meeting.close('again'), 'VMU_STATE', 'closing twice is refused')
}

// ---- 7. self-probe ----------------------------------------------------------------------------
if (SELF_PROBE) {
  const src = await readFile(MODULE, 'utf8')
  const guard = "      inputs[member] = text\n      currentRound.answers[member] = { at: clock(), chars: text.length }"
  const bug = "      refused[member] = (refused[member] || []).concat([{ at: row.at, reason: String(reason) }])"
  if (src.indexOf(bug) === -1) {
    ok(false, 'self-probe anchor applies (refuseInput is present)', 'ANCHOR MISS')
  } else {
    const dir = await mkdtemp(join(tmpdir(), 'vmu-meeting-mut-'))
    await mkdir(join(dir, 'kernel'), { recursive: true })
    // The v5r bug, reproduced: a refused input ALSO lands in `inputs`.
    const mutated = src.replace(bug, "      inputs[member] = text\n" + bug)
    await writeFile(join(dir, 'kernel', 'meeting.js'), mutated, 'utf8')
    const mm = await import(pathToFileURL(join(dir, 'kernel', 'meeting.js')).href + '?probe=1')
    const mb = mm.createMeeting({ id: 'p', roster: ['r-1', 'r-2'] })
    await mb.convene('x')
    await mb.openRound({})
    mb.refuseInput('r-2', 'refused text', 'frozen')
    const untouched = mb.summary().inputs['r-2'] === undefined
    // With the bug the refused input IS recorded: the regression assertion must therefore fail.
    ok(untouched === true, 'self-probe: bug reintroduced => the "refusal is not an input" assertion fails (as required)', 'untouched=' + untouched)
    await rm(dir, { recursive: true, force: true })
  }
  console.log('=== VMU MEETING SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}

// ---- B6: the three meeting controls are REAL consumers (timeout / quote cap / quote depth) ----------
{
  let nowMs = Date.parse('2026-10-09T00:00:00.000Z')
  let paused = false
  const meeting = m.createMeeting({ id: 'mt-b6', roster, deliver: async () => {}, roundTimeoutMs: 1000,
    quotesPerMessageMax: 2, quoteDepthMax: 3, isPaused: () => paused, clock: () => new Date(nowMs).toISOString() })
  await meeting.convene('an agenda')
  await meeting.openRound({ members: roster })
  const fine = await meeting.speak(roster[0], 'within budget', { quotes: [{ id: 'q1', depth: 1 }] })
  ok(fine.ok === true && fine.quotes === 1 && fine.folded === 0, 'within both quote budgets the input is accepted', JSON.stringify(fine))

  let refused = null
  try { await meeting.speak(roster[0], 'too many quotes', { quotes: [{ depth: 1 }, { depth: 1 }, { depth: 1 }] }) } catch (e) { refused = e }
  ok(refused && refused.code === 'VMU_INVALID_ARGUMENT' && /at most 2 quote/.test(String(refused.message)),
    'quotesPerMessageMax REFUSES BY NAME with the numbers (as declared)', String(refused && refused.message))

  const deep = await meeting.speak(roster[0], 'too deep', { quotes: [{ id: 'deep', depth: 9 }] })
  ok(deep.ok === true && deep.folded === 1 && /folded/i.test(String(deep.foldingNotice)),
    'quoteDepthMax FOLDS and COUNTS instead of refusing (as declared - the opposite policy of the cap)',
    JSON.stringify(deep).slice(0, 140))

  nowMs += 5000
  refused = null
  try { await meeting.speak(roster[1], 'too late') } catch (e) { refused = e }
  ok(refused && refused.code === 'VMU_STATE' && /timed out/.test(String(refused.message)) && /1000ms/.test(String(refused.message)),
    'roundTimeoutMs refuses further input after the round budget', String(refused && refused.message))

  // ROUND 50 REGRESSION DEFENCE: the very same scenario with a NUMERIC clock must reach the SAME verdict. Before
  // the fix `Date.parse(clock())` was NaN whenever the caller injected a numeric clock - which the kernel does
  // (its guarded clock returns a number) - so the budget check silently stopped firing and a stale round accepted
  // input forever. Two clocks, one verdict.
  let numNowMs = Date.parse('2026-10-09T00:00:00.000Z')
  const numeric = m.createMeeting({ id: 'mt-b6-num', roster, deliver: async () => {}, roundTimeoutMs: 1000,
    clock: () => numNowMs })
  await numeric.convene('an agenda')
  await numeric.openRound({ members: roster })
  const numFine = await numeric.speak(roster[0], 'within budget')
  ok(numFine.ok === true, 'a NUMERIC clock passes the pre-budget check too (it used to be silently NaN)', JSON.stringify(numFine))
  numNowMs += 5000
  let numRefused = null
  try { await numeric.speak(roster[1], 'too late') } catch (e) { numRefused = e }
  ok(numRefused && numRefused.code === 'VMU_STATE' && /timed out/.test(String(numRefused.message)) && /1000ms/.test(String(numRefused.message)),
    'roundTimeoutMs fires with a NUMERIC clock exactly as with an ISO one - the regression this guards',
    String(numRefused && numRefused.message))

  paused = true
  const other = m.createMeeting({ id: 'mt-b6b', roster, deliver: async () => {}, isPaused: () => paused })
  refused = null
  try { await other.convene('x') } catch (e) { refused = e }
  ok(refused && refused.code === 'VMU_STATE' && /paused/.test(String(refused.message)),
    'a paused kernel refuses to CONVENE a meeting (control flow is not ledger-only)', String(refused && refused.message))
  refused = null
  try { await meeting.speak(roster[1], 'still paused') } catch (e) { refused = e }
  ok(refused && refused.code === 'VMU_STATE' && /paused/.test(String(refused.message)),
    'and a pause freezes speech in an already-running round')
}

// ---- ROUND 88 (R10-2a): the EXPLICIT end of debate gates aggregation, and the gate is proven reachable ----
{
  const dm = m.createMeeting({ id: 'mt-debate', roster, deliver: async () => {}, clock: () => 0 })
  // Non-vacuous from the first line: before anything happens the answer must be NO **with a reason**, so a
  // gate that always said yes would fail here rather than pass quietly.
  const before = dm.aggregationAllowed()
  ok(before.allowed === false && /no explicit end/.test(String(before.reason)),
    'before any round, aggregation is NOT allowed and the answer says why (never a silent yes)', JSON.stringify(before))
  await dm.convene('a debate')
  await dm.openRound({ members: roster })
  const open = dm.aggregationAllowed()
  ok(open.allowed === false && /round is open/.test(String(open.reason)),
    'with a round open and no explicit end, aggregation is NOT allowed', JSON.stringify(open))
  await expectThrow(() => dm.endDebate({ by: roster[0] }), 'VMU_INVALID_ARGUMENT',
    'endDebate without a reason is refused by name (an unexplained end is the silent-stop failure mode)')
  const ended = dm.endDebate({ by: roster[0], reason: 'evidence is in', target: 'p-x' })
  ok(ended.ok === true && ended.by === roster[0] && ended.reason === 'evidence is in' && ended.target === 'p-x',
    'endDebate records WHO ended it, WHY and about WHAT', JSON.stringify(ended))
  const after = dm.aggregationAllowed()
  ok(after.allowed === true && /ended explicitly by/.test(String(after.reason)),
    'AFTER the explicit end, aggregation IS allowed and names who ended it', JSON.stringify(after))
  await expectThrow(() => dm.endDebate({ by: roster[1], reason: 'again' }), 'VMU_STATE',
    'a SECOND end is refused (an explicit end is a fact, not a repeatable action)')
  await dm.openRound({ members: roster })
  const newRound = dm.aggregationAllowed()
  ok(newRound.allowed === false,
    'opening a NEW round clears the previous end (a new debate must be ended on its own)', JSON.stringify(newRound))
}

console.log('=== VMU MEETING: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
