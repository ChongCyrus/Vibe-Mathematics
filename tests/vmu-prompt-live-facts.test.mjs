// tests/vmu-prompt-live-facts.test.mjs — R10: the two live facts the charter asks for, and the placeholder that
// pretended to be one.
//
// WHY THIS SUITE EXISTS (measured, not imagined): the accepted live run `full-1024-021750.jsonl` produced member
// prompts that contained, verbatim:
//
//   〔未提供：setting:vmu.turn.instituteName〕   〔未提供：setting:vmu.turn.leaderId〕
//   〔未提供：roster〕                            〔未提供：quorum〕
//   # v5r-effective-tools-chair
//   【本轮你实际能调用的工具｜占位段】 … 你读到了原文，说明替换没有发生。
//
// Three separate causes, all fixed in the same batch and all pinned here:
//   1. `{{ setting:... }}` read the CONFIGURED map only, so a key with a DECLARED default still rendered as missing.
//      (Defaults are deliberately not materialised into `settings`; the template channel now shares the one reader
//      `readSetting` every other consumer uses.)
//   2. `{{ roster }}` / `{{ quorum }}` had a documented contract (`rosterLine(member)` / `quorumM()`) and NO producer:
//      `open()` accepts both, `step()`/`drive()` never passed them. A `turnFacts` seam now supplies them.
//   3. The three `v5r-effective-tools-*` sections are HOST-ONLY placeholders (host.js writes the real list over them in
//      the ROOT system prompt). The turn pipeline has no replacement step, so it must not carry them at all.
//
// WHAT THIS SUITE CANNOT PROVE: it does not run a host, so it cannot prove the host's replacement of the placeholder
// still works (that path is `vibe-math-vmu/host.js` and is covered by its own suites). It proves the framework's half:
// defaults reach the text, the seam reaches the text, an absent seam stays honestly missing, a throwing seam refuses by
// name, and the turn policy injects zero placeholders.
//
// Run: node tests/vmu-prompt-live-facts.test.mjs   (last line: === VMU PROMPT LIVE FACTS: N passed, M failed ===)

import { createTurnOrchestrator, deliverByReturning } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { decideSections, HOST_ONLY_SECTIONS } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'
import { CHARTER_LEADER_PAIRS } from '../vibe-math-vmu/packs/v5r/prompts/v5r-charter.js'
import { PACK } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 240) + ']')) }
}

// A one-section prompt that names exactly the four holes measured on the live run, plus one key that does NOT exist so
// the suite can prove the fix did not turn "unknown" into "empty" (a wrong fix would make every key look answered).
const PROBE_TEXT = [
  'INSTITUTE[{{ setting:vmu.turn.instituteName }}]',
  'LEADER[{{ setting:vmu.turn.leaderId }}]',
  'ROSTER[{{ roster }}]',
  'QUORUM[{{ quorum }}]',
  'UNKNOWN[{{ setting:vmu.no.such.key }}]',
].join('\n')
const PROBE_SECTION = Object.freeze({ name: 'probe-live-facts', order: 700, range: 'pack', text: PROBE_TEXT })
const pipeline = () => createPromptPipeline({ sections: [PROBE_SECTION], clock: () => '2026-01-01T00:00:00.000Z' })
const mkTurn = (extra = {}) => createTurnOrchestrator({ sectionPolicy: decideSections, prompt: pipeline(), deliver: deliverByReturning(), ...extra })

// ── 1. THE DECLARED DEFAULT REACHES THE TEXT (cause 1, framework level) ────────────────────────────────────────────
{
  // The seam the kernel installs is `(key) => readSetting(settingsView, key)`; here it is a table so the assertion is
  // about the CHANNEL, not about the schema loader (covered by the kernel-level case below).
  const p = createPromptPipeline({
    sections: [PROBE_SECTION],
    clock: () => '2026-01-01T00:00:00.000Z',
    settingFallback: (key) => ({ 'vmu.turn.instituteName': 'institute' })[key],
  })
  const asm = await p.assemble({ settings: {} })
  ok(asm.text.includes('INSTITUTE[institute]'),
    'F1. ★★★ a setting with a declared default renders its DEFAULT, not a missing-slot marker', { got: (asm.text.match(/INSTITUTE\[[^\]]*\]/) || [])[0] })
  ok(!asm.text.includes('〔未提供：setting:vmu.turn.instituteName〕'),
    'F2. ★★★ and the live run\'s marker 〔未提供：setting:vmu.turn.instituteName〕 is gone')
  ok(asm.text.includes('UNKNOWN[〔未提供：setting:vmu.no.such.key〕]'),
    'F3. ★★ a key that is NOT declared still reports itself missing — the fallback did not paper over unknowns',
    { got: (asm.text.match(/UNKNOWN\[[^\]]*\]/) || [])[0] })
  const explicit = await createPromptPipeline({
    sections: [PROBE_SECTION], clock: () => '2026-01-01T00:00:00.000Z',
    settingFallback: (key) => ({ 'vmu.turn.instituteName': 'institute' })[key],
  }).assemble({ settings: { 'vmu.turn.instituteName': '研究院' } })
  ok(explicit.text.includes('INSTITUTE[研究院]'),
    'F4. ★★★ an EXPLICIT value still wins over the default (the fallback is a fallback, not an override)',
    { got: (explicit.text.match(/INSTITUTE\[[^\]]*\]/) || [])[0] })
}

// ── 2. THE KERNEL WIRES THAT SEAM (cause 1, wiring level) ──────────────────────────────────────────────────────────
{
  // createKernel is what the live plugin uses; if it forgot to pass `settingFallback`, the framework-level fix above
  // would be true and inert — the exact "declared but not wired" class this round hunts.
  const kernel = createKernel({
    settings: {},
    host: null,
    sections: [PROBE_SECTION],
    deliverTurn: deliverByReturning(),
  })
  const receipt = await kernel.turn.run({ member: 'r-1', phase: 'normal' })
  const text = (receipt && receipt.memberPrompt && receipt.memberPrompt.text) || ''
  ok(text.includes('INSTITUTE[') && !text.includes('〔未提供：setting:vmu.turn.instituteName〕'),
    'F5. **** createKernel\'s pipeline carries the declared-default reader: a real kernel turn no longer prints the hole',
    { chars: text.length, got: (text.match(/INSTITUTE\[[^\]]*\]/) || [])[0] })
}

// ── 3. THE turnFacts SEAM (cause 2) ────────────────────────────────────────────────────────────────────────────────
{
  const t = mkTurn({ turnFacts: () => ({ roster: '- r-1 · member\n- r-2 · member', quorum: 2 }) })
  const r = await t.run({ member: 'r-1', phase: 'normal' })
  const text = (r && r.memberPrompt && r.memberPrompt.text) || ''
  ok(/ROSTER\[- r-1 · member/.test(text),
    'F6. ★★★ the roster the deployment supplies reaches the member text — the charter\'s staff snapshot stops being a hole',
    { got: (text.match(/ROSTER\[[^\]]*\]/) || [])[0] })
  ok(/QUORUM\[2\]/.test(text),
    'F7. ★★★ and so does the vote floor m (the same number the charter\'s 「m = …」 sentences need)',
    { got: (text.match(/QUORUM\[[^\]]*\]/) || [])[0] })
  ok(!text.includes('〔未提供：roster〕') && !text.includes('〔未提供：quorum〕'),
    'F8. ★★★ and neither 〔未提供：roster〕 nor 〔未提供：quorum〕 survives into the prompt')
}
{
  // No seam ⇒ the historical behaviour. NOT an invented value: an empty roster reads as "no staff", a fact a reader
  // cannot distinguish from a bug, so the slot reports itself missing instead.
  const t = mkTurn()
  const r = await t.run({ member: 'r-1', phase: 'normal' })
  const text = (r && r.memberPrompt && r.memberPrompt.text) || ''
  ok(text.includes('〔未提供：roster〕') && text.includes('〔未提供：quorum〕'),
    'F9. ★★ with NO turnFacts seam the slots still say they are missing — the framework never invents deployment facts',
    { roster: (text.match(/ROSTER\[[^\]]*\]/) || [])[0], quorum: (text.match(/QUORUM\[[^\]]*\]/) || [])[0] })
}
{
  // A seam that throws is a NAMED refusal: a half-drawn roster would be worse than a hole, so it must not degrade.
  const t = mkTurn({ turnFacts: () => { throw new Error('roster store unavailable') } })
  let caught = null
  let receipt = null
  try { receipt = await t.run({ member: 'r-1', phase: 'normal' }) } catch (e) { caught = e }
  const blob = JSON.stringify({ code: caught && caught.code, message: caught && caught.message, receipt })
  ok(blob.includes('VMU_ENGINE_UNAVAILABLE') && blob.includes('turn-facts'),
    'F10. ★★★ a THROWING turnFacts seam refuses by name (VMU_ENGINE_UNAVAILABLE) instead of rendering half a situation',
    { caught: caught && caught.code, blob: blob.slice(0, 160) })
}

// ── 4. THE HOST-ONLY PLACEHOLDERS (cause 3) ───────────────────────────────────────────────────────────────────────
{
  const declared = new Set((PACK.sections || []).map((s) => s && s.name).filter(Boolean))
  // EMPTY_ALLOWED: HOST_ONLY_SECTIONS is a frozen literal of three names; emptiness is a pack-load bug the case above
  // would already have reported, so demanding a non-empty guard here would only restate the literal.
  ok(HOST_ONLY_SECTIONS.length === 3 && HOST_ONLY_SECTIONS.every((n) => declared.has(n)),
    'F11. ★★★ the three host-only sections are still DECLARED by the pack, so the host still has a target to replace',
    { hostOnly: HOST_ONLY_SECTIONS, declared: HOST_ONLY_SECTIONS.filter((n) => declared.has(n)) })
  const decisions = decideSections({ settings: {}, turn: {} }).decisions
  const byName = new Map(decisions.map((d) => [d.name, d.enabled]))
  // EMPTY_ALLOWED: same frozen three-name literal as F11 — an empty list here means the pack declared nothing, which
  // F11 already fails on; this case is about the POLICY verdict for each declared name.
  ok(HOST_ONLY_SECTIONS.every((n) => byName.get(n) === false),
    'F12. ★★★ and the TURN policy injects NONE of them (a placeholder whose producer never runs on this path is a lie)',
    { decisions: HOST_ONLY_SECTIONS.map((n) => [n, byName.get(n)]) })
  // The claim is about assembled text, not just the policy's verdict: a policy that decided false but a pipeline that
  // ignored it would leave the placeholder in place. Prove it through a real turn with the pack's own sections.
  // ★ The bindings are part of what makes a role block address the right role: without them every role-kind section
  // renders its DEFAULT text (the member variant), which is exactly how this suite first "measured" that the chair's
  // prompt named a 常驻研究员. `PACK.bindings` is what the host mounts, so the test must mount it too.
  const packPipeline = createPromptPipeline({ sections: PACK.sections, bindings: PACK.bindings, clock: () => '2026-01-01T00:00:00.000Z' })
  const t = createTurnOrchestrator({ sectionPolicy: decideSections, prompt: packPipeline, deliver: deliverByReturning() })
  const r = await t.run({ member: 'r-1', phase: 'normal' })
  const text = (r && r.memberPrompt && r.memberPrompt.text) || ''
  ok(!/# v5r-effective-tools-/.test(text) && !text.includes('占位段'),
    'F13. ★★★★ no assembled member prompt carries a `# v5r-effective-tools-*` placeholder (measured text of the live run did)',
    { headings: (text.match(/^# v5r-[a-z-]+/gm) || []).slice(0, 8) })
}

// ── 5. R13: THE ROSTER FACT MUST REACH THE DECISION (not only the sentence) ───────────────────────────────────────
{
  // Measured on a live run: five `-leaderless` sections sat next to `# v5r-charter-org` naming
  // 「本所的领头人是**院士 member-1**」. Root cause: the turn-facts seam answered `roster` as PROSE, the policy reads
  // IDS, so an institute with a seated chair looked leaderless to the decision and staffed to the sentence.
  const leaderPairs = PACK.sections && PACK.sections.length ? null : null // (kept for readability below)
  const withLeader = decideSections({
    settings: { 'vmu.turn.leaderId': 'r-1' },
    turn: { phase: 'meeting', meetingState: 'others', rosterIds: ['r-1', 'r-2'] },
  })
  const enabled = new Map(withLeader.decisions.map((d) => [d.name, d.enabled]))
  const lessNames = [...enabled.keys()].filter((n) => n.endsWith('-leaderless'))
  // EMPTY_ALLOWED: the pack might declare no leaderless variants at all; the assertion below is the pair verdict, and a
  // pack with zero pairs would be caught by tests/vmu-charter-leader-pair.test.mjs (which derives its list from the pack).
  ok(lessNames.length > 0 && lessNames.every((n) => enabled.get(n) === false),
    'R13a. ★★★ with the structured roster fact the policy picks the WITH-LEADER variant of every pair', { lessNames, enabled: lessNames.map((n) => enabled.get(n)) })
  ok(enabled.get('v5r-charter-division') === true && enabled.get('v5r-charter-rule-7') === true,
    'R13b. ★★★ and the naming variants it picked are enabled (not merely "the leaderless ones are off")',
    { division: enabled.get('v5r-charter-division'), rule7: enabled.get('v5r-charter-rule-7') })

  // The OLD shape must stay readable as "ids unknown", never guessed from a sentence: parsing prose would be a second,
  // silently divergent reader of the same fact — the class this repository keeps paying for.
  const proseOnly = decideSections({ settings: { 'vmu.turn.leaderId': 'r-1' }, turn: { phase: 'meeting', meetingState: 'others', roster: '- r-1 · chair\n- r-2 · member' } })
  const proseBy = new Map(proseOnly.decisions.map((d) => [d.name, d.enabled]))
  ok(proseBy.get('v5r-charter-division') === false && proseBy.get('v5r-charter-division-leaderless') === true,
    'R13c. ★★★ a PROSE roster is not ids: the policy refuses to parse it and keeps the safe default (leaderless)',
    { division: proseBy.get('v5r-charter-division'), leaderless: proseBy.get('v5r-charter-division-leaderless') })

  // End to end through a REAL turn with the pack's own sections: the composed prompt must not negate itself.
  const packPipeline = createPromptPipeline({ sections: PACK.sections, bindings: PACK.bindings, clock: () => '2026-01-01T00:00:00.000Z' })
  const t13 = createTurnOrchestrator({
    sectionPolicy: decideSections,
    prompt: packPipeline,
    deliver: deliverByReturning(),
    turnFacts: () => ({ roster: '- r-1 · chair\n- r-2 · member', rosterIds: ['r-1', 'r-2'], quorum: 2 }),
  })
  const r13 = await t13.run({ member: 'r-2', phase: 'normal' })
  const text13 = (r13 && r13.memberPrompt && r13.memberPrompt.text) || ''
  // The setting comes from the schema default ('' here), so this case proves the CHANNEL only; the live run supplies
  // the id through `vibe_v5_configure`. What must hold regardless: the prompt never says both things at once.
  ok(text13.includes('本所的领头人') || text13.includes('本所当前没有在册院士') || text13.length > 0,
    'R13d. (channel probe) the composed prompt is non-empty so the following assertion has a subject', { chars: text13.length })
  // ★ MEASURED FALSE POSITIVE, now designed out: the first version of this assertion looked for the PHRASE
  // 「本所当前没有在册院士」 anywhere in the text — and `v5r-corrections.js` QUOTES that phrase inside its own correction
  // (「…章程会走 leaderless 版并说「本所当前没有在册院士」，那是假的」), so the detector fired on a warning ABOUT the
  // defect. A phrase an instruction quotes can never be evidence that the instruction commits it. The assertions now ask
  // the prompt's STRUCTURE: which variant SECTION headings were carried.
  const carried = (text, name) => text.split('\n').some((line) => line === '# ' + name)
  const lessCarried = CHARTER_LEADER_PAIRS.map(([, l]) => l).filter((n) => carried(text13, n))
  const withCarried = CHARTER_LEADER_PAIRS.map(([w]) => w).filter((n) => carried(text13, n))
  ok(!(lessCarried.length > 0 && withCarried.length > 0),
    'R13e. ★★★★★ ONE prompt carries at most ONE variant of each leader pair — never both stories at once',
    { lessCarried, withCarried })

  // ── R13, third pass: the CONDITION was wrong, not just the channel ────────────────────────────────────────────────
  // The rule says: if the prompt says 「本所当前没有在册院士」 while an academician SITS in the chair, the framework is at
  // fault. So "leaderless" must mean "nobody occupies the leading seat", never "the `vmu.turn.leaderId` setting is unset".
  // Live run 3 measured exactly that: chair seated, setting unset ⇒ five leaderless sections + a roster line naming
  // 「院士 member-1（你）—— 本所领头人」 in ONE prompt.
  const t13b = createTurnOrchestrator({
    sectionPolicy: decideSections,
    prompt: packPipeline,
    deliver: deliverByReturning(),
    turnFacts: () => ({ roster: '- r-1 · chair\n- r-2 · member', rosterIds: ['r-1', 'r-2'], chairId: 'r-1', quorum: 2 }),
  })
  const r13b = await t13b.run({ member: 'r-1', phase: 'normal', role: 'chair' })
  const text13b = (r13b && r13b.memberPrompt && r13b.memberPrompt.text) || ''
  const by13b = new Map((decideSections({ settings: {}, turn: { phase: 'normal', rosterIds: ['r-1', 'r-2'], chairId: 'r-1' } }).decisions).map((d) => [d.name, d.enabled]))
  ok(by13b.get('v5r-charter-division') === true && by13b.get('v5r-charter-division-leaderless') === false,
    'R13f. ★★★★ a SEATED chair is a leader even when `vmu.turn.leaderId` is unset (setting wins, seat is the fallback)',
    { division: by13b.get('v5r-charter-division'), leaderless: by13b.get('v5r-charter-division-leaderless') })
  const lessB = CHARTER_LEADER_PAIRS.map(([, l]) => l).filter((n) => carried(text13b, n))
  const withB = CHARTER_LEADER_PAIRS.map(([w]) => w).filter((n) => carried(text13b, n))
  ok(lessB.length === 0 && withB.length > 0 && /\*\*院士 r-1（你）\*\*/.test(text13b),
    'R13g. ★★★★ the seated chair prompt carries NO leaderless variant, carries the with-leader ones, and names the chair',
    { lessB, withB, namesChair: /\*\*院士 r-1（你）\*\*/.test(text13b), chars: text13b.length })

  // The temp block speaks to ONE role. Measured live: the chair's prompt carried it ("你的雇主：…").
  const acad13 = new Map(decideSections({ settings: {}, turn: { phase: 'normal', role: 'chair', rosterIds: ['r-1', 'r-2'], chairId: 'r-1' } }).decisions.map((d) => [d.name, d.enabled]))
  const temp13 = new Map(decideSections({ settings: {}, turn: { phase: 'normal', role: 'temp', rosterIds: ['r-1', 'r-2'], chairId: 'r-1' } }).decisions.map((d) => [d.name, d.enabled]))
  ok(acad13.get('v5r-charter-roster-temp') === false && acad13.get('v5r-charter-roster-temp-leaderless') === false,
    'R13h. ★★★★ the temp-only pair is OFF for the chair (a chair is not told who employs them)',
    { withLeader: acad13.get('v5r-charter-roster-temp'), leaderless: acad13.get('v5r-charter-roster-temp-leaderless') })
  ok((temp13.get('v5r-charter-roster-temp') === true) !== (temp13.get('v5r-charter-roster-temp-leaderless') === true),
    'R13i. ★★★ and exactly ONE of its variants is on for a temp (the pair still decides the variant, not the role)',
    { withLeader: temp13.get('v5r-charter-roster-temp'), leaderless: temp13.get('v5r-charter-roster-temp-leaderless') })
  const norole13 = new Map(decideSections({ settings: {}, turn: { phase: 'normal', rosterIds: ['r-1', 'r-2'], chairId: 'r-1' } }).decisions.map((d) => [d.name, d.enabled]))
  ok(norole13.get('v5r-charter-roster-temp') === true,
    'R13j. ★★★ an UNKNOWN role changes nothing: the pair keeps its variant decision (no silent off-switch)',
    { withLeader: norole13.get('v5r-charter-roster-temp'), leaderless: norole13.get('v5r-charter-roster-temp-leaderless') })
}

// ═══ R14 (found in live run 5's transcripts): A ROLE-CLAIMING SECTION REACHED A SEAT THAT IS NOT THAT ROLE ═══════════
// `v5r-turn-acad-leads` opens with 「作为院士，除了做研究，你还要**统筹全所**」. It is declared `kind: 'shared'`, so the
// assembly handed it to EVERY seat: run 5's member-2 (a researcher) was literally told to coordinate the whole institute.
// The fix is a second, FAIL-CLOSED policy list (`ROLE_CLAIMING_SECTIONS`): the section survives only for the role it
// claims. These assertions ask BOTH layers — the decision list AND a real assembled prompt — because the previous round
// proved a decision-level assertion alone can be true while the real prompt disagrees.
{
  const packPipeline14 = createPromptPipeline({ sections: PACK.sections, bindings: PACK.bindings, clock: () => '2026-01-01T00:00:00.000Z' })
  const pick14 = (turn) => new Map(decideSections({ settings: {}, turn }).decisions.map((d) => [d.name, d.enabled]))
  const chair14 = pick14({ phase: 'normal', role: 'chair', rosterIds: ['r-1', 'r-2'], chairId: 'r-1' })
  const member14 = pick14({ phase: 'normal', role: 'member', rosterIds: ['r-1', 'r-2'], chairId: 'r-1' })
  const temp14 = pick14({ phase: 'normal', role: 'temp', rosterIds: ['r-1', 'r-2'], chairId: 'r-1' })
  const unknown14 = pick14({ phase: 'normal', rosterIds: ['r-1', 'r-2'], chairId: 'r-1' })
  ok(chair14.get('v5r-turn-acad-leads') !== false,
    'R14a. the chair keeps the 「作为院士…统筹全所」 section (nothing is emitted for the role it claims)', { chair: chair14.get('v5r-turn-acad-leads') })
  ok(member14.get('v5r-turn-acad-leads') === false,
    'R14b. ★★★★★ a plain member does NOT get the academician-leadership section (this is what live run 5 violated)',
    { member: member14.get('v5r-turn-acad-leads') })
  ok(temp14.get('v5r-turn-acad-leads') === false,
    'R14c. ★★★ a temp seat does not get it either', { temp: temp14.get('v5r-turn-acad-leads') })
  ok(unknown14.get('v5r-turn-acad-leads') === false,
    'R14d. ★★★★ FAIL-CLOSED: an unknown role must not be told 「作为院士」 (the opposite policy from the leader pair, R13j)',
    { unknown: unknown14.get('v5r-turn-acad-leads') })

  const t14 = createTurnOrchestrator({
    sectionPolicy: decideSections,
    prompt: packPipeline14,
    deliver: deliverByReturning(),
    turnFacts: () => ({ roster: '- r-1 · chair\n- r-2 · member', rosterIds: ['r-1', 'r-2'], chairId: 'r-1', quorum: 2 }),
  })
  const asChair14 = await t14.run({ member: 'r-1', phase: 'normal', role: 'chair' })
  const asMember14 = await t14.run({ member: 'r-2', phase: 'normal', role: 'member' })
  const textChair14 = (asChair14 && asChair14.memberPrompt && asChair14.memberPrompt.text) || ''
  const textMember14 = (asMember14 && asMember14.memberPrompt && asMember14.memberPrompt.text) || ''
  const carried14 = (text, name) => text.split('\n').some((line) => line === '# ' + name)
  ok(carried14(textChair14, 'v5r-turn-acad-leads') && textChair14.includes('作为院士，除了做研究'),
    'R14e. the REAL chair prompt carries the section heading', { chars: textChair14.length })
  // ★ MEASURED FALSE POSITIVE, designed out: an earlier version of this assertion banned the PHRASE 「统筹全所」 from the
  // member prompt, but three sections ADDRESSED TO THE MEMBER legitimately describe the chair's job with that phrase
  // (「主动向院士汇报：它需要你的进展…才能统筹全所」). What must be absent is the ROLE CLAIM ITSELF — the opening line
  // 「作为院士，除了做研究，你还要…」 and the section heading. Banning a word instead of the claim would have been a
  // gate that fires on correct text.
  ok(!carried14(textMember14, 'v5r-turn-acad-leads') && !textMember14.includes('作为院士，除了做研究'),
    'R14f. ★★★★★ the REAL member prompt carries neither the role-claiming heading nor its opening claim 「作为院士…」 (end-to-end)',
    { chars: textMember14.length })
}

console.log('\n=== VMU PROMPT LIVE FACTS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f) }
process.exit(failed ? 1 : 0)
