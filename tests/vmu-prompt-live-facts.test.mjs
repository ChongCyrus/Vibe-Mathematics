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
  const packPipeline = createPromptPipeline({ sections: PACK.sections, clock: () => '2026-01-01T00:00:00.000Z' })
  const t = createTurnOrchestrator({ sectionPolicy: decideSections, prompt: packPipeline, deliver: deliverByReturning() })
  const r = await t.run({ member: 'r-1', phase: 'normal' })
  const text = (r && r.memberPrompt && r.memberPrompt.text) || ''
  ok(!/# v5r-effective-tools-/.test(text) && !text.includes('占位段'),
    'F13. ★★★★ no assembled member prompt carries a `# v5r-effective-tools-*` placeholder (measured text of the live run did)',
    { headings: (text.match(/^# v5r-[a-z-]+/gm) || []).slice(0, 8) })
}

console.log('\n=== VMU PROMPT LIVE FACTS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f) }
process.exit(failed ? 1 : 0)
