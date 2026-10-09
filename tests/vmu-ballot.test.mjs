// vmu ballot — the capability scenario for kernel/ballot.js (docs/08 §3).
//
// The scenarios are the invariants, not the happy path:
//   · I-1: a PROCESS reading never decides anything, and an `undecided` outcome always carries a reason;
//   · the s8-freeze-say REGRESSION, reproduced deliberately: a cast refused because the ballot is frozen
//     must leave the tally untouched, so nothing downstream can mistake a refusal for a step towards
//     "done" (in v5r that mistake closed a meeting early);
//   · every refusal is NAMED and kept in history, so "what was refused and why" is as auditable as what
//     was accepted;
//   · the tally and the other decision points are pluggable, and a replaced tally still cannot remove the
//     three-valued contract.
//
// `--self-probe` copies the module, REMOVES the frozen-cast guard (letting a refused cast be counted) and
// requires the regression assertion to fail - the technique tests/run-tests.mutants.mjs uses on the runner.

import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const MODULE = resolve(REPO, 'vibe-math-vmu', 'kernel', 'ballot.js')
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
const members = ['r-1', 'r-2']

// ---- 1. unanimity decides; anything else is undecided WITH a reason -----------------------------
{
  const b = m.createBallot({ target: 'prop-1', eligible: members })
  await b.open()
  await b.cast('r-1', 1)
  await b.cast('r-2', 1)
  const r = await b.close()
  ok(r.outcome === true && b.status().outcome.outcome === true, 'unanimous 1s decide TRUE')
  ok(r.tally.reason === 'unanimous for', 'the decision carries its reason', r.tally.reason)

  const mixed = m.createBallot({ target: 'prop-2', eligible: members })
  await mixed.open()
  await mixed.cast('r-1', 1)
  await mixed.cast('r-2', 0)
  const rm = await mixed.close()
  ok(rm.outcome === 'undecided' && !!rm.tally.reason, 'a split vote is UNDECIDED and says why', rm.tally.reason)

  const partial = m.createBallot({ target: 'prop-3', eligible: members })
  await partial.open()
  await partial.cast('r-1', 1)
  const rp = await partial.close()
  ok(rp.outcome === 'undecided' && /not every eligible/.test(rp.tally.reason), 'a partial vote is undecided with the count', rp.tally.reason)

  const against = m.createBallot({ target: 'prop-4', eligible: members })
  await against.open()
  await against.cast('r-1', 0)
  await against.cast('r-2', 0)
  ok((await against.close()).outcome === false, 'unanimous 0s decide FALSE')
}

// ---- 2. I-1: process readings never decide -----------------------------------------------------
{
  const b = m.createBallot({ target: 'prop-5', eligible: members })
  await b.open()
  await b.cast('r-1', 1, { kind: 'process' })
  await b.cast('r-2', 1, { kind: 'process' })
  const r = await b.close()
  ok(r.outcome === 'undecided' && /no decisive vote/.test(r.tally.reason),
    'two process readings decide NOTHING (I-1: a process reading is not a verdict)', r.tally.reason)
  ok(b.processReadings().length === 2 && b.status().byKind.process === 2, 'process readings are still reported, just not decisive')
}

// ---- 3. THE REGRESSION: a refused cast is not a vote (s8-freeze-say) ---------------------------
{
  const b = m.createBallot({ target: 'prop-6', eligible: members })
  await b.open()
  await b.cast('r-1', 1)
  await b.freeze('ballot in progress')
  const before = JSON.stringify(b.status().votes)
  await expectThrow(() => b.cast('r-2', 1), 'VMU_STATE', 'a cast during a frozen ballot is refused by name')
  const after = JSON.stringify(b.status().votes)
  ok(before === after, 'the refused cast left the tally byte-identical (it is NOT a vote)', before + ' vs ' + after)
  ok(b.status().refused.some((r) => r.reason === 'in-frozen-ballot'), 'the refusal is recorded in history with its reason')
  const r = await b.close('frozen close')
  ok(r.outcome === 'undecided' && /not every eligible/.test(r.tally.reason),
    'the frozen refusal did not move the ballot towards a decision', r.tally.reason)
  ok(b.status().frozen === false, 'closing a frozen ballot clears the frozen flag (the freeze was about the round)')
  await b.reopen('second round')
  await b.cast('r-2', 1)
  const r2 = await b.close('second close')
  ok(r2.outcome === 'undecided', 'the reopened ballot tallies only the votes actually cast (one of two eligible)')
}

// ---- 4. every other refusal is named, recorded, and equally non-counting ------------------------
{
  const b = m.createBallot({ target: 'prop-7', eligible: ['r-1'] })
  await b.open()
  await expectThrow(() => b.cast('r-2', 1), 'VMU_NOT_PERMITTED', 'an ineligible member is refused')
  await expectThrow(() => b.cast('r-1', 2), 'VMU_INVALID_ARGUMENT', 'a non-boolean decisive vote is refused')
  await b.cast('r-1', 1)
  await expectThrow(() => b.cast('r-1', 1), 'VMU_STATE', 'a duplicate vote is refused')
  ok(b.status().voteCount === 1, 'exactly one vote is counted after three refusals', b.status().voteCount)
  ok(b.status().refused.length === 3, 'all three refusals are in the audit trail', b.status().refused.length)
  ok(b.history().some((h) => h.what === 'cast'), 'accepted casts are in the same history (one audit trail)')
}

// ---- 5. decision points are pluggable, and cannot remove the contract --------------------------
{
  const opened = []
  const b = m.createBallot({ target: 'prop-8', eligible: members, canOpen: ({ target }) => { opened.push(target); return true } })
  await b.open()
  ok(opened.length === 1, 'canOpen is asked exactly once')
  const refusedOpen = m.createBallot({ target: 'prop-9', canOpen: () => ({ ok: false, message: 'not yet registered' }) })
  await expectThrow(() => refusedOpen.open(), 'VMU_NOT_PERMITTED', 'a refusing canOpen blocks the opening with its message')
  ok(refusedOpen.status().state === 'closed', 'a refused opening changes no state')

  const custom = m.createBallot({ target: 'prop-10', eligible: members, tally: () => ({ outcome: 'undecided' }) })
  await custom.open()
  await expectThrow(() => custom.close(), 'VMU_MIDDLEWARE_FAILED',
    'a tally that leaves undecided unexplained is refused (the three-valued contract holds)')
  const rule = m.createBallot({ target: 'prop-11', eligible: members, tally: () => ({ outcome: true, reason: 'the pack says so' }) })
  await rule.open()
  const rr = await rule.close()
  ok(rr.outcome === true && rr.tally.reason === 'the pack says so', 'a replaced tally can decide by its own rule (policy lives outside)')
}

// ---- 6. freeze/unfreeze and reopen state discipline --------------------------------------------
{
  const b = m.createBallot({ target: 'prop-12', eligible: members })
  await expectThrow(() => b.cast('r-1', 1), 'VMU_STATE', 'casting on a closed ballot is refused')
  await expectThrow(() => b.close(), 'VMU_STATE', 'closing a closed ballot is refused')
  await b.open()
  await expectThrow(() => b.open(), 'VMU_STATE', 'opening twice is refused')
  await expectThrow(() => b.unfreeze(), 'VMU_STATE', 'unfreezing a ballot that is not frozen is refused')
  await b.freeze()
  ok(b.status().frozen === true && b.status().state === 'frozen', 'freeze moves the state machine')
  await b.close('closed while frozen')
  await expectThrow(() => b.close(), 'VMU_STATE', 'a tallied ballot cannot be closed again')
  await b.reopen('again')
  ok(b.status().state === 'open' && b.status().voteCount === 0, 'reopen starts a fresh round (nothing is overwritten: the old outcome is in history)')
  ok(b.history().some((h) => h.what === 'reopened' && h.previous !== undefined), 'the reopen record keeps the previous outcome')
}

// ---- 7. self-probe ----------------------------------------------------------------------------
if (SELF_PROBE) {
  const src = await readFile(MODULE, 'utf8')
  const guard = "      if (frozen || isFrozen({ member, target })) {"
  if (src.indexOf(guard) === -1) {
    ok(false, 'self-probe anchor applies (the frozen-cast guard is present)', 'ANCHOR MISS')
  } else {
    const dir = await mkdtemp(join(tmpdir(), 'vmu-ballot-mut-'))
    await mkdir(join(dir, 'kernel'), { recursive: true })
    await writeFile(join(dir, 'kernel', 'ballot.js'), src.replace(guard, '      if (false) {'), 'utf8')
    const mm = await import(pathToFileURL(join(dir, 'kernel', 'ballot.js')).href + '?probe=1')
    const mb = mm.createBallot({ target: 'p', eligible: ['r-1', 'r-2'] })
    await mb.open()
    await mb.cast('r-1', 1)
    await mb.freeze('x')
    let counted = false
    try { await mb.cast('r-2', 1); counted = true } catch { counted = false }
    // With the guard removed the frozen cast IS counted: the regression assertion must therefore fail.
    ok(counted === false, 'self-probe: guard removed => the frozen-refusal assertion fails (as required)', 'counted=' + counted)
    await rm(dir, { recursive: true, force: true })
  }
  console.log('=== VMU BALLOT SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}

// ---- V7: a pause freezes the ballot (open AND cast) ---------------------------------------------------
{
  let paused = true
  const b = m.createBallot({ target: 'prop-pause', eligible: members, isPaused: () => paused })
  let refused = null
  try { await b.open() } catch (e) { refused = e }
  ok(refused && refused.code === 'VMU_STATE' && /paused/.test(String(refused.message)),
    'a paused kernel refuses to OPEN a ballot', String(refused && refused.message))
  paused = false
  await b.open()
  paused = true
  refused = null
  try { await b.cast(members[0], 'for') } catch (e) { refused = e }
  ok(refused && refused.code === 'VMU_STATE' && /paused/.test(String(refused.message)),
    'and it refuses CASTING while paused (a ballot that can still be voted is not frozen)',
    String(refused && refused.message))
  paused = false
  let afterResume = null
  try { await b.cast(members[0], 'for') } catch (e) { afterResume = e }
  ok(!afterResume || !(afterResume.code === 'VMU_STATE' && /paused/.test(String(afterResume.message))),
    'after the resume the PAUSE gate no longer blocks the cast (any other refusal is the vote rule, not control flow)',
    String(afterResume && afterResume.code))
}

console.log('=== VMU BALLOT: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
