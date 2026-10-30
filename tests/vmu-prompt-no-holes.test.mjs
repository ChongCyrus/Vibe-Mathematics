// tests/vmu-prompt-no-holes.test.mjs — finding (f): NO member prompt may carry a 「〔未提供：…〕」 hole
//
// WHY THIS SUITE EXISTS (measured on live run 12, `_oneoff/vm-slv/full-1024-142038.jsonl`): the institute's acceptance
// agent reported that non-chair seats were handed prompts with raw placeholders — 「未提供：roleLabel」 25 times and
// 「未提供：statusBlock」 11 times, e.g. 「角色：〔未提供：roleLabel〕」 and 「# v5r-brief-status 〔未提供：statusBlock〕」.
// It was RIGHT, and both were the same class: a section rendered a variable that the TURN LOOP never supplies.
//
//   · `statusBlock` — `v5r-brief-status` was the bare `{{ statusBlock }}` and `v5r-meeting-others` put it under a heading
//     claiming the other members' opinions had been forwarded. Only the v3 pack's MIDDLEWARE fills that variable; the
//     v5r turn loop never does, so the block was a promise with nothing behind it.
//   · `roleLabel` — the prompt pipeline documents it as loop-composed (`kernel/prompt/index.js:40-47`) and the pack
//     rewrites `{{ role }}` → `{{ roleLabel }}` at load (`packs/v5r/prompts/v5r-core.js:68-73`), but neither
//     `turn.open()` nor `turn.step()` accepted it and the turn-facts seam did not report it: NO PRODUCER existed.
//
// THE FIX THIS SUITE PINS (mechanism in kernel, vocabulary in pack):
//   1. `kernel/index.js` turnFacts maps the member's SLOT to that slot's declared `label` and returns `roleLabel`;
//      `kernel/turn/index.js` carries it through the merge into `open()`.
//   2. `packs/v5r/prompts/v5r-core.js` slot labels now use the rule's own words (院士 / 常驻研究员 / 临时工).
//   3. the two v5r sections stopped naming `{{ statusBlock }}`: the brief is spelled with variables the loop supplies,
//      and the meeting section points at where opinions are actually readable instead of claiming they were forwarded.
//
// WHAT THIS SUITE CANNOT PROVE: it does not run the real host (no host prompt, no delivery), and it does not prove a
// MODEL reads the block. It proves the two layers that produced the holes: the seam really reports a label for a seated
// member, and the assembled text really contains no hole for any seat.
//
// Run: node tests/vmu-prompt-no-holes.test.mjs   (last line: === VMU PROMPT NO HOLES: N passed, M failed ===)

import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { deliverByReturning } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { decideSections } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'
import { PACK } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 300) + ']')) }
}

const HOLES = /〔未提供：([^〕]+)〕/g
const holesIn = (text) => [...String(text).matchAll(HOLES)].map((m) => m[1])

// ── 1. THE SECTIONS: no pack section may name a variable nobody supplies ───────────────────────────────────────────
{
  const sections = PACK.sections
  const named = []
  for (const s of sections) {
    for (const m of String(s.text === undefined ? '' : s.text).matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) named.push({ section: s.name, variable: m[1] })
  }
  const statusBlockUsers = named.filter((n) => n.variable === 'statusBlock').map((n) => n.section)
  // `v5r-brief-status` is ALLOWED to render it — the loop now composes that block when the caller supplies none — but it
  // must be the ONLY section that does, and `v5r-meeting-others` must not (it used to render it under a heading claiming
  // the other members' opinions had been forwarded, which nothing ever filled).
  ok(statusBlockUsers.length === 1 && statusBlockUsers[0] === 'v5r-brief-status',
    'the per-round brief is the ONE section that renders {{ statusBlock }} (the loop composes it; the meeting section does not)', statusBlockUsers)
  const brief = sections.find((s) => s.name === 'v5r-brief-status')
  ok(brief !== undefined, 'the per-round brief section still exists')
  ok(String(brief.text || '').trim() === '{{ statusBlock }}', 'the brief is the ONE placeholder — spelling the fields out printed the state twice (T99)', String(brief.text || '').trim())
  const others = sections.find((s) => s.name === 'v5r-meeting-others')
  const othersText = String((others && others.text) || '')
  ok(!othersText.includes('statusBlock'), 'the meeting-others section no longer asks for the unsupplied statusBlock')
  ok(!/框架已转发/.test(othersText), 'and it no longer CLAIMS the opinions were forwarded', othersText.slice(0, 120))
  // RUN 147 / audit16 G24: the section used to point at `action: "minutes"`, an action this face does not have
  // (measured: unknown action: minutes). The reads that DO exist are `status` and `summary` — and neither returns the
  // verbatim speech, so the section points at those two, says so, and must not resurrect the dead action.
  ok(/action/.test(othersText) && /"status"/.test(othersText) && /"summary"/.test(othersText),
    'it points at the reads that actually exist (status / summary)', othersText.slice(0, 240))
  ok(!/action\s*[:=]\s*"?minutes/.test(othersText), 'it no longer points at the minutes action the face does not have', othersText.slice(0, 240))
  ok(/没有逐字发言/.test(othersText), 'it says plainly that there is no verbatim-speech read here', othersText.slice(0, 240))
}

// ── 2. END TO END FOR EVERY SEAT: a REAL kernel turn hands a seated member a prompt with NO hole and a NAMED seat ──
// The seam itself is an INTERNAL option of the orchestrator (`kernel/index.js` passes `turnFacts` into
// `createTurnOrchestrator`); it is deliberately not a public kernel method, so it is measured the way a member sees it —
// through the prompt the turn returns — rather than by calling an internal.
{
  const kernel = createKernel({ clock: () => 2000, settings: {}, host: null, sections: PACK.sections, slots: PACK.slots, sectionPolicy: decideSections, deliverTurn: deliverByReturning() })
  await kernel.members.hire({ id: 'r-1', slot: 'chair' })
  await kernel.members.hire({ id: 'r-2', slot: 'member' })
  await kernel.members.hire({ id: 'r-3', slot: 'temp' })
  const expectations = [
    { id: 'r-1', label: '院士' },
    { id: 'r-2', label: '常驻研究员' },
    { id: 'r-3', label: '临时工' },
  ]
  // ★ RULE E: a loop over an EMPTY collection is a vacuous pass, so the set is pinned before it runs.
  ok(expectations.length === 3, 'exactly the three seats under test (a shrunken set would pass the loop below vacuously)', expectations.length)
  const seen = new Set()
  for (const seat of expectations) {
    const receipt = await kernel.turn.run({ member: seat.id, phase: 'normal' })
    const text = String((receipt && receipt.memberPrompt && receipt.memberPrompt.text) || '')
    ok(text.length > 3000, 'the kernel assembled a real prompt for ' + seat.label, { chars: text.length })
    const holes = holesIn(text)
    ok(holes.length === 0, '★ ' + seat.label + '\u2019s prompt carries NO 「〔未提供：…〕」 hole', holes.slice(0, 5))
    ok(text.includes(seat.label), 'the prompt names that seat with the rule\u2019s own word (' + seat.label + ')', text.slice(0, 80))
    ok(!text.includes('〔未提供：roleLabel〕'), '★ the exact hole the live run reported is gone for ' + seat.label)
    ok(!text.includes('〔未提供：statusBlock〕'), '★ and the statusBlock hole is gone for ' + seat.label)
    seen.add(seat.label)
  }
  ok(seen.size === 3, 'the three seats really got three DIFFERENT names (a constant would satisfy the strings above by accident)', [...seen])
  // The brief carries real data, not a hole.
  const chairText = String((await kernel.turn.run({ member: 'r-1', phase: 'normal' })).memberPrompt.text)
  ok(/\[在册\]/.test(chairText), 'the brief carries the roster heading')
  ok(/\[状态\]/.test(chairText) && /第 \d+ 轮/.test(chairText), 'and the state line with the round number')
  ok(/m = \d+/.test(chairText), 'and the vote floor as a NUMBER, not a hole')
}

console.log('')
console.log('=== VMU PROMPT NO HOLES: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) console.log('failed: ' + failures.join(' | '))
process.exit(failed ? 1 : 0)
