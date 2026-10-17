// tests/vmu-turn-sections-not-runtime.test.mjs — task-215 ①: the `v5rTurnSections` export must not be able to leak
// frozen snapshot values into a live prompt without saying so BY NAME.
//
// WHY THIS EXISTS. `packs/v5r/prompts/v5r-prompts.js` is a CAPTURED SNAPSHOT: it holds 66 literal `轮次 N` and 66
// literal `有表决权者 N 人`, which the original derived at runtime (`rounds.get()`, `voterCount()`). Those values are
// EVIDENCE — they are why the corpus is a faithful A/B baseline — so the file must not be edited. But the bridge
// `packs/v5r/prompts/v5r-core.js` also exports `v5rTurnSections`, described as "what a v5r-pack host should hand the
// pipeline": wire THAT up and all 66 frozen round numbers become live prompt text.
//
// THE RULING (docs/26 §3.7, round 374): the RUNTIME declaration is the hand-written charter, NOT the captured corpus.
// Today `PACK.sections` is the charter set, so the leak is latent. This suite makes the latency EXPLICIT and gives the
// boundary a named refusal, so the dangerous path cannot be taken silently:
//   §1 the hazard is real and MEASURED (the unsafe set really carries the snapshot literals);
//   §2 the live runtime set does NOT (the positive control, so "the guard always refuses" is impossible);
//   §3 the guard REFUSES BY NAME on the unsafe set, with the reason in the message;
//   §4 the refusal is what the wiring path would hit (both directions on the same function).
import { v5rTurnSections, v5rPromptSections, PACK, assertRuntimeSafeSections } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const attempt = (fn) => { try { return { value: fn() } } catch (e) { return { code: (e && e.code) || null, message: String((e && e.message) || e), hint: e && e.hint ? String(e.hint) : null } } }
const textsOf = (list) => (Array.isArray(list) ? list : []).map((s) => String((s && s.text) || '')).join('\n')

console.log('=== §1 THE HAZARD IS REAL: the corpus-derived set carries frozen snapshot values ===')
{
  const unsafe = textsOf(v5rTurnSections)
  const rounds = (unsafe.match(/轮次\s*\d+/g) || []).length
  const voters = (unsafe.match(/有表决权者\s*\d+\s*人/g) || []).length
  ok(rounds > 0 && voters > 0,
    '★ `v5rTurnSections` really contains literal round numbers and voter counts (so wiring it up would freeze them into live prompts)',
    { literalRounds: rounds, literalVoterCounts: voters, sections: v5rTurnSections.length })
  ok(v5rPromptSections.length > 0 && v5rTurnSections.length >= v5rPromptSections.length,
    'and it is the corpus bridge PLUS the authored role block, not a hand-written charter',
    { corpus: v5rPromptSections.length, turnSections: v5rTurnSections.length })
}

console.log('=== §2 THE POSITIVE CONTROL: the LIVE runtime set carries none of them ===')
{
  const live = textsOf(PACK.sections)
  const liveRounds = (live.match(/轮次\s*\d+/g) || []).length
  const liveVoters = (live.match(/有表决权者\s*\d+\s*人/g) || []).length
  ok(PACK.sections.length > 0 && liveRounds === 0 && liveVoters === 0,
    '★ `PACK.sections` (the set the manifest really declares) has ZERO literal round numbers and ZERO literal voter counts — so the guard below is not "refuses everything"',
    { sections: PACK.sections.length, liveRounds, liveVoters })
}

console.log('=== §3 THE GUARD REFUSES BY NAME, WITH THE REASON ===')
{
  const r = attempt(() => assertRuntimeSafeSections(v5rTurnSections, 'task-215 probe'))
  ok(typeof r.code === 'string' && r.code === 'VMU_PACK_V5R_CORPUS_NOT_RUNTIME',
    '★ passing the corpus-derived set to the guard refuses BY NAME (`VMU_PACK_V5R_CORPUS_NOT_RUNTIME`)', r)
  ok(/snapshot|baseline|轮次|has no round|frozen/i.test(r.message || ''),
    '★ and the refusal message says WHY (a captured snapshot must not become a runtime source)', { message: r.message })
}

console.log('=== §4 BOTH DIRECTIONS ON THE SAME FUNCTION ===')
{
  const good = attempt(() => assertRuntimeSafeSections(PACK.sections, 'task-215 probe'))
  ok(good.code === undefined && good.value && good.value.ok === true,
    'the LIVE charter set passes the same guard (so the refusal is aimed, not blanket)', good)
  ok(PACK.sections !== v5rTurnSections,
    'and the two sets are different objects, so a wire-up that mixes them is visible rather than accidental', {})
}

console.log('=== §5 THE RUNTIME SOURCE IS SECTIONS **AND BINDINGS**, SO THE DOOR CHECKS BOTH ===')
{
  // ★ ROUND 94 MEASURED THIS HOLE: the guard inspected only sections while the pipeline assembles sections PLUS
  // bindings, and one charter binding (phase `verify`) carried a captured absolute path. The guard answered {ok:true}
  // and an assembled verify-phase prompt really did contain it - a guard covering half the runtime source is worse
  // than none, because it reports safety.
  const live = attempt(() => assertRuntimeSafeSections(PACK.sections, 'round-94 probe', PACK.bindings))
  ok(live.code === undefined && live.value && live.value.ok === true && live.value.bindings === PACK.bindings.length,
    '★ the LIVE sections AND bindings pass the guard together, and the receipt says how many bindings were examined',
    { value: live.value })
  const planted = attempt(() => assertRuntimeSafeSections([], 'planted probe', [{ section: 'x', phase: 'verify', text: 'read VibeMath/Projects/default/Institutions/x' }]))
  ok(planted.code === 'VMU_PACK_V5R_CORPUS_NOT_RUNTIME',
    '★★ and a BINDING that carries a captured value is refused by name - the hole this round measured', planted)
  // the offending site is named in the HINT (the message carries the count and the reason), so both are checked
  ok(/binding/.test((planted.message || '') + ' ' + (planted.hint || '')),
    '★ the refusal names it as a BINDING rather than a section, so the reader knows which half broke', { message: (planted.message || '').slice(0, 120) })
  const compat = attempt(() => assertRuntimeSafeSections(PACK.sections, 'two-arg callers still work'))
  ok(compat.code === undefined && compat.value && compat.value.bindings === 0,
    'and the two-argument form still works unchanged, reporting zero bindings examined rather than pretending to have checked them',
    { value: compat.value })
}

console.log('=== §6 NO PROMPT BLOCK CARRIES A CAPTURED ABSOLUTE PATH ANY MORE ===')
{
  // the text used to say `VibeMath/Projects/default/Institutes/institute/Formal/Lib/` - a literal from the captured run
  const texts = textsOf(PACK.bindings.map((b) => ({ text: b.text })))
  ok(!/VibeMath\/Projects\//.test(texts),
    '★ no binding text carries the captured `VibeMath/Projects/` path; the instruction uses the relative `Formal/Lib/` that every other path in the charter uses')
  ok(/Formal\/Lib\//.test(texts),
    'and the Lean hint still POINTS somewhere - the path was made relative, not deleted')
}
console.log('')
console.log('=== VMU TURN SECTIONS NOT RUNTIME: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n'))
process.exitCode = failed === 0 ? 0 : 1


