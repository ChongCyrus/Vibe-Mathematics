// run 45 — the acceptance harness pointed the office at `members: ['r-1']` in a FRESH institute whose roster was empty.
// The kernel accepted the selection and went on to deliver, then sat out the 180 s delivery timeout for a child session
// that never existed. Two readers were wrong: the loop (it could have checked the roster it is given) and my brief (it
// assumed seats that had never been hired). This file pins the loop's half; the brief is fixed in D:\_tmp.
import { createTurnOrchestrator } from '../vibe-math-vmu/kernel/turn/index.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}

const fence = (obj) => ({ reply: '```json\n' + JSON.stringify(obj) + '\n```' })
const pipeline = () => ({ assemble: async () => ({ text: 'mock', sources: 1, instructionDelivered: false }) })
const rows = [{ id: 'r-1', slot: 'chair' }, { id: 'r-2', slot: 'member' }]
const facts = () => ({ roster: rows, rosterIds: ['r-1', 'r-2'], rosterRows: rows, chairId: 'r-1', roleLabel: null, quorum: { required: 1, met: true } })
const mk = (seam) => createTurnOrchestrator({ sectionPolicy: () => [], prompt: pipeline(), turnFacts: seam,
  deliver: async () => fence({ say: 'x' }) })

// ── the refusal ────────────────────────────────────────────────────────────────────────────────────────────
{
  const t = mk(facts)
  let code = null
  let message = null
  let hint = null
  try {
    await t.step({ members: ['r-ghost'], why: 'an unknown member must not be delivered to' })
  } catch (e) { code = e && e.code; message = String(e && e.message); hint = String(e && e.hint) }
  ok(code === 'VMU_TURN_UNKNOWN_MEMBER', '★★★ R45a: an explicit member who is not on the roster is REFUSED BY NAME', code)
  ok(/r-ghost/.test(String(message)), '★★ R45b: the message names the offending id (so it can be fixed without a rerun)', message)
  ok(/r-1, r-2/.test(String(hint)), '★★ R45c: the hint prints the LIVE roster, so the caller can pick from it', hint)
  ok(/timeout/.test(String(hint)), '★★ R45d: and it says what would otherwise happen (the delivery timeout that was actually burned)', hint)
}

// ── the negatives: a good selection, an inferred selection, and no roster at all must all be allowed ──────
{
  const t = mk(facts)
  let threw = null
  try { await t.step({ members: ['r-2'], why: 'a real member' }) } catch (e) { threw = e && e.code }
  ok(threw === null, '★★ R45e: a roster member is NOT refused (the guard is not a blanket refusal)', threw)
}
{
  const t = mk(facts)
  let threw = null
  try { await t.step({ members: ['r-1', 'r-2'], membersInferred: true, why: 'the face infers the roster' }) } catch (e) { threw = e && e.code }
  ok(threw === null, '★★ R45f: an INFERRED list is never checked against itself (that would make the face\'s own inference a refusal)', threw)
}
{
  // an absent/partial seam is not evidence that everyone is unknown — the guard must stay silent
  const t = mk(() => ({ roster: null, rosterIds: null, rosterRows: null, chairId: null, roleLabel: null, quorum: null }))
  let threw = null
  try { await t.step({ members: ['r-9'], why: 'no roster available' }) } catch (e) { threw = e && e.code }
  ok(threw !== 'VMU_TURN_UNKNOWN_MEMBER', '★★★ R45g: with NO roster the loop does not guess (silence is not evidence)', threw)
}

console.log('=== VMU RUN45 FINDINGS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) console.log('FAILURES: ' + failures.join(' | '))
process.exit(failed ? 1 : 0)
