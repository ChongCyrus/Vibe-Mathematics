// tests/vmu-charter-leader-pair.test.mjs — the LEADER PAIR: a leaderless institute must never be told it has an academician.
//
// WHY THIS TEST EXISTS (measured, not imagined). A full live SLV run drove two members through vibe_vmu_turn, hired them, opened a
// meeting, collected the closure vote and reached cast:true — and then reported "several charter fields unresolved: leaderId" as a
// defect. It was right: the charter always emitted the with-leader sentence, `{{ setting:vmu.turn.leaderId }}` defaults to '' (schema.js
// vmu.turn.leaderId def:''), so a leaderless institute was literally told 「本所的领头人是**院士 。」.
//
// The two texts had existed all along in `texts.leaderless`, and `charterSections({hasLeader:false})` could already choose them, but
// NOTHING could ever pass false: the manifest's `sections` getter is no-arg (v5r-core.js), the frozen CHARTER_SECTIONS hardcodes true,
// and the section policy can only enable/disable by NAME (kernel/pack.js: "a later policy wins for the same section NAME") while both
// variants shared one name. This test pins the repair: the leaderless texts are now declared under their OWN names, the policy enables
// exactly one of each pair, and the chosen text never contains the empty naming slot.
//
// WHAT THIS TEST DOES NOT PROVE: it does not assemble a real host prompt end to end (that needs a live host — see the named "not run"
// section of vmu-assistant-host-slice). It proves the DECISION and the TEXT, which is the layer the defect lived in.
import { CHARTER_BLOCKS, CHARTER_LEADER_PAIRS, CHARTER_LEADERLESS_SECTIONS, CHARTER_LEADER_VARIANTS, charterSections } from '../vibe-math-vmu/packs/v5r/prompts/v5r-charter.js'
import { decideSections } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const NAMING_SLOT = /\{\{\s*setting:vmu\.turn\.leaderId\s*\}\}/
const leaderConditional = CHARTER_BLOCKS.filter((b) => b.kind === 'leader-conditional')

console.log('=== 1. THE PAIRS AND THE SEPARATE NAMES EXIST ===')
{
  ok(leaderConditional.length > 0,
    '★ there is at least one leader-conditional block (otherwise this whole test is vacuous)', { count: leaderConditional.length })
  ok(CHARTER_LEADER_PAIRS.length === leaderConditional.length,
    '★ CHARTER_LEADER_PAIRS covers EVERY leader-conditional block - a pair missing here would be a block the policy can never switch',
    { pairs: CHARTER_LEADER_PAIRS.length, blocks: leaderConditional.length })
  ok(CHARTER_LEADERLESS_SECTIONS.length === leaderConditional.length,
    '★ CHARTER_LEADERLESS_SECTIONS declares one section per leader-conditional block', { sections: CHARTER_LEADERLESS_SECTIONS.length })
  const namesUnique = new Set(CHARTER_BLOCKS.map((b) => b.name)).size === CHARTER_BLOCKS.length
  const lessNamesUnique = new Set(CHARTER_LEADERLESS_SECTIONS.map((s) => s.name)).size === CHARTER_LEADERLESS_SECTIONS.length
  const noOverlap = CHARTER_LEADERLESS_SECTIONS.every((s) => !CHARTER_BLOCKS.some((b) => b.name === s.name))
  ok(namesUnique && lessNamesUnique && noOverlap,
    '★ every leaderless section has its OWN name and none collides with a with-leader name - duplicate section names are a named pack conflict',
    { namesUnique, lessNamesUnique, noOverlap })
}

console.log('=== 2. THE LEADERLESS TEXT NEVER CARRIES THE NAMING SLOT ===')
{
  const leaking = CHARTER_LEADERLESS_SECTIONS.filter((s) => NAMING_SLOT.test(String(s.text || '')))
  ok(leaking.length === 0,
    '★ NO leaderless section contains {{ setting:vmu.turn.leaderId }} - that slot is what rendered as 「院士 。」 when the value was empty',
    leaking.map((s) => s.name))
  // and the with-leader variant is expected to carry it: that is the whole point of the split
  const withSlot = leaderConditional.filter((b) => NAMING_SLOT.test(String((b.texts || {})['with-leader'] || '')))
  ok(withSlot.length > 0,
    '★ the with-leader variants DO name the leader through the setting (so the split is a real split, not two copies of the same text)',
    withSlot.map((b) => b.name))
  // the two variants must actually differ, or the switch would be cosmetic
  const identical = leaderConditional.filter((b) => {
    const t = b.texts || {}
    return String(t['with-leader'] || '') === String(t.leaderless || '')
  })
  ok(identical.length === 0,
    '★ no pair has identical with-leader and leaderless texts (a cosmetic switch would satisfy the policy and change nothing)',
    identical.map((b) => b.name))
  // every block must HAVE a leaderless text, or the missing-text placeholder would ship
  const missing = leaderConditional.filter((b) => typeof (b.texts || {}).leaderless !== 'string')
  ok(missing.length === 0,
    '★ every leader-conditional block carries a real leaderless text (none falls back to CHARTER_LEADERLESS_MISSING_TEXT)',
    missing.map((b) => b.name))
}

console.log('=== 3. THE POLICY ENABLES EXACTLY ONE OF EACH PAIR ===')
{
  const cases = [
    ['empty leaderId', { settings: { 'vmu.turn.leaderId': '' }, turn: { roster: [{ id: 'm1' }] } }, false],
    ['leader ON staff', { settings: { 'vmu.turn.leaderId': 'm1' }, turn: { roster: [{ id: 'm1' }] } }, true],
    ['leader NOT on staff', { settings: { 'vmu.turn.leaderId': 'm9' }, turn: { roster: [{ id: 'm1' }] } }, false],
    ['explicit turn.leaderOnStaff', { settings: {}, turn: { leaderOnStaff: true } }, true],
    ['no roster at all (unknowable)', { settings: { 'vmu.turn.leaderId': 'm1' }, turn: {} }, false],
  ]
  for (const [label, args, expectLeader] of cases) {
    const d = decideSections(args)
    const byName = new Map(d.decisions.map((x) => [x.name, x.enabled]))
    let okAll = true
    let shape = []
    for (const [withName, leaderlessName] of CHARTER_LEADER_PAIRS) {
      const w = byName.get(withName)
      const l = byName.get(leaderlessName)
      // exactly one, and the right one
      if (w !== expectLeader || l !== !expectLeader) { okAll = false; shape.push({ withName, w, l }) }
    }
    ok(okAll,
      '★ ' + label + ' \u21d2 with-leader=' + expectLeader + ' / leaderless=' + !expectLeader + ' for EVERY pair',
      shape.slice(0, 3))
    ok(d.errors.length === 0, '★ ' + label + ' \u21d2 no policy errors (a policy that raises here would refuse the turn)', d.errors)
  }
  // ★ THE SAFE DEFAULT, PINNED: an unknowable roster must resolve to leaderless. A false "no leader" costs a flatter paragraph;
  // a false "leader is X" tells the whole institute to report to someone who may not exist (v5r-charter.js rule 1).
  const unknowable = decideSections({ settings: { 'vmu.turn.leaderId': 'm1' }, turn: {} })
  const pair = CHARTER_LEADER_PAIRS[0]
  const m = new Map(unknowable.decisions.map((x) => [x.name, x.enabled]))
  ok(m.get(pair[0]) === false && m.get(pair[1]) === true,
    '★★ the SAFE DEFAULT holds: when the policy cannot prove the leader is on staff it emits the leaderless text, never the naming one',
    { with: m.get(pair[0]), leaderless: m.get(pair[1]) })
}

console.log('=== 4. NOTHING THAT WORKED BEFORE IS BROKEN ===')
{
  // CHARTER_SECTIONS / charterSections({hasLeader:true}) must still produce the historical reading
  const withLeader = charterSections({ hasLeader: true })
  ok(Array.isArray(withLeader) && withLeader.length === CHARTER_BLOCKS.length,
    '★ charterSections({hasLeader:true}) still returns one section per block (the default reading is unchanged)', { n: withLeader.length })
  const blockNames = new Set(CHARTER_BLOCKS.map((b) => b.name))
  const pairNames = new Set(CHARTER_LEADER_PAIRS.map((p) => p[0]))
  ok([...pairNames].every((n) => blockNames.has(n)),
    '★ every pair uses a REAL block name as its with-leader side (no invented section the manifest never declares)',
    [...pairNames].filter((n) => !blockNames.has(n)))
  ok(Object.keys(CHARTER_LEADER_VARIANTS).length === leaderConditional.length,
    '★ CHARTER_LEADER_VARIANTS still covers every leader-conditional block (the leaderless texts are reached THROUGH it, so the two cannot drift)',
    { variants: Object.keys(CHARTER_LEADER_VARIANTS).length })
}

console.log('=== VMU CHARTER LEADER PAIR: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) {
  console.error('\nFAILURES:')
  for (const f of failures) console.error('  - ' + f)
}
process.exit(failed ? 1 : 0)
