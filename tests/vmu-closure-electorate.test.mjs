// tests/vmu-closure-electorate.test.mjs — R6: THE FLOOR'S UNIVERSE MUST CONTAIN THE CHAIR.
//
// THE RULE (《v5r pack 运行规则》，逐字): 「辩论与结题表决人数下限 = min(用户设置数, 院士+常驻研究员数)」.
// The floor is counted over 「院士 + 常驻研究员」 — the academician is part of the electorate, not outside it.
//
// THE MEASURED CONFLICT (accepted live run `full-1024-021750.jsonl`): the pack's `chair` slot permissions were
// `['convene','close','assign','grant','freeze']` — no `vote` — so `closureVote.eligible` listed only the residents
// (`["member-2"]`) while the chair sat in the same room. The framework said so in its own words ("the v5r pack grants
// it to `member` but NOT to `chair` or `temp`"), which made the disagreement between the pack's授权 and the rule's
// wording explicit rather than accidental. A floor computed over a universe that excludes the chair cannot agree with
// a rule that counts the chair.
//
// WHAT THIS SUITE PINS: the pack's seats, read as DATA (not hand-copied), and the kernel's ONE closure-vote calculation
// evaluated with those seats. It cannot prove that a live model will vote; it proves the electorate it would vote in.
//



// Run: node tests/vmu-closure-electorate.test.mjs   (last line: === VMU CLOSURE ELECTORATE: N passed, M failed ===)

import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { toolSpecs, TOOL_NAMES } from '../vibe-math-vmu/host.js'
import { deliverByReturning, closureVoteOf } from '../vibe-math-vmu/kernel/turn/index.js'
import { PACK } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; failures.push(label); console.log('  FAIL ' + label + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 240) + ']')) }
}

const slotOf = (id) => (PACK.slots || []).find((s) => s && s.id === id) || {}
const perms = (id) => (Array.isArray(slotOf(id).permissions) ? slotOf(id).permissions : [])

// ── 1. THE PACK'S SEATS: the rule's universe is enfranchised, temps are not ───────────────────────────────────────
{
  ok(perms('chair').includes('vote'),
    'E1. ★★★ the pack\'s chair seat holds `vote` — the academician is INSIDE the rule\'s 「院士+常驻研究员」 universe',
    { chair: perms('chair') })
  ok(perms('member').includes('vote'),
    'E2. ★★ and the resident seat does too (unchanged)', { member: perms('member') })
  ok(!perms('temp').includes('vote'),
    'E3. ★★ a temp holds NO vote — the rule counts 常驻研究员, and a temp is not one', { temp: perms('temp') })
  ok(perms('chair').includes('convene') && perms('chair').includes('close'),
    'E4. ★★ the chair keeps its convening/closing authority — adding the vote did not trade one permission for another',
    { chair: perms('chair') })
}

// ── 2. THE KERNEL'S ONE CALCULATION, WITH THE PACK'S REAL SEATS ──────────────────────────────────────────────────
{
  const kernel = createKernel({
    clock: () => 1000,
    settings: {},
    deliverTurn: deliverByReturning(),
    slots: PACK.slots,
  })
  const specs = toolSpecs({ kernel, settings: {}, turnTool: true, meetingTool: true, controlTool: true })
  const spec = (n) => specs.find((s) => s.name === n)
  await spec(TOOL_NAMES.control).run({ action: 'hire', member_id: 'm1', slot: 'chair', institution: 'I' })
  await spec(TOOL_NAMES.control).run({ action: 'hire', member_id: 'm2', slot: 'member', institution: 'I' })
  await spec(TOOL_NAMES.control).run({ action: 'hire', member_id: 'm3', slot: 'temp', institution: 'I' })
  const st = kernel.status({ detail: 'summary' })
  const eligible = (st.closureVote && st.closureVote.eligible) || []
  ok(JSON.stringify(eligible) === JSON.stringify(['m1', 'm2']),
    'E5. ★★★★ closureVote.eligible = chair + resident, temp excluded — the rule\'s universe, computed by the kernel',
    { eligible })
  ok((st.closureVote && st.closureVote.missing || []).length === 2,
    'E6. ★★★ and NOTHING is cast yet: both enfranchised members are named as missing (silence must block closure)',
    { missing: st.closureVote && st.closureVote.missing })
  // ★ RUN 30 ⑥: the sentence used to read "silence blocks closure", which a live reader took as "this close was illegal" —
  // the close rail and the closure VOTE are two mechanisms (the close was `ok:true`). The wording now names which of the
  // two the silence blocks, so the assertion follows the new sentence (the FALLBACK arm is unchanged, not widened).
  ok((st.closureVote && st.closureVote.reason || '').includes('silence blocks the CLOSURE VOTE') || st.closureVote.cast === false,
    'E7. ★★ the reading explains itself instead of reporting a bare false', { reason: st.closureVote && st.closureVote.reason })
}

// ── 3. RUN-88 F-87-03: the counting WINDOW is readable and a repeated vote cannot raise the count ────────────────
{
  const roster = [{ id: 'r-1' }, { id: 'r-2' }, { id: 'r-3' }]
  const rowsAll = [
    { member: 'r-1', solved: true, at: 10, window: 2 },
    { member: 'r-2', solved: true, at: 11, window: 2 },
    { member: 'r-3', solved: false, at: 12, window: 1 },
    { member: 'r-3', solved: true, at: 9, window: 2 },
  ]
  const current = rowsAll.filter((r) => r.window === 2)
  const votes = new Map([['r-1', true], ['r-2', true], ['r-3', true]])
  const view = closureVoteOf({ votes, roster, rows: current, rowsAll, window: 2 })
  ok(view.rowsRead === 4 && view.rowsCounted === 3 && view.rowsArchivedByWindow === 1 && view.countWindow === 2,
    'W1. ★★★ closureVote reports rowsRead / rowsCounted / rowsArchivedByWindow / countWindow — the window is a READING, not an inference',
    { read: view.rowsRead, counted: view.rowsCounted, archived: view.rowsArchivedByWindow, win: view.countWindow })
  ok(view.votesCast === 3 && view.cast === true && view.missing.length === 0,
    'W2. ★★ only the CURRENT-window rows count: the stale window-1 row is archived, not silently merged', { cast: view.cast, missing: view.missing })
  ok(view.votersWindows && view.votersWindows['r-3'] === 2,
    'W3. ★ the per-member window stamp is exposed (the row this tally used was window 2)', view.votersWindows)
  const repeated = current.concat([{ member: 'r-1', solved: true, at: 20, window: 2 }])
  const view2 = closureVoteOf({ votes, roster, rows: repeated, rowsAll: rowsAll.concat([{ member: 'r-1', solved: true, at: 20, window: 2 }]), window: 2 })
  ok(view2.rowsCounted === 3 && view2.votesCast === view.rowsCounted && view2.cast === view.cast,
    'W4. ★★★ a REPEATED vote in the same window does not change the count semantics (rowsCounted per member, votesCast arrivals)',
    { counted: view2.rowsCounted, votesCast: view2.votesCast })
  const lamp = closureVoteOf({ votes: new Map([['r-1', true], ['r-2', true], ['r-3', false]]), roster, rows: rowsAll, rowsAll, window: 2 })
  ok(lamp.votesCast === 3 && lamp.rowsArchivedByWindow === 1 && lamp.rowsByWindow['1'] === 1,
    'W5. LAMP RED-worthy: raw rows expose the archived window (rowsByWindow); a pre-fix merge counted it, the current rows do not', { byWindow: lamp.rowsByWindow })
}

console.log('\n=== VMU CLOSURE ELECTORATE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f) }
process.exit(failed ? 1 : 0)
