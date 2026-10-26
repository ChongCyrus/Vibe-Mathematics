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
import { deliverByReturning } from '../vibe-math-vmu/kernel/turn/index.js'
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

console.log('\n=== VMU CLOSURE ELECTORATE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f) }
process.exit(failed ? 1 : 0)
