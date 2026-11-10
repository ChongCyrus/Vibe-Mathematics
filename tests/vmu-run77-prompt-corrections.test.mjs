// RUN 77 (TB-2725) — six prompt corrections from the 77th live run. Every assertion reads the ASSEMBLED text
// through the same collector the budget audit uses (never a source grep): the defect was that readers followed the
// prompt and did the wrong thing, so only shipped text counts.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'

const { collect } = await import(new URL('../scripts/sim/audit/prompt-sections.mjs', import.meta.url).href)

const got = await collect({ slots: ['chair', 'member', 'temp'], phases: ['normal', 'meeting'] })
const sections = got.sections
const textOf = (slot, phase) => sections.filter((s) => s.slot === slot && s.phase === phase).map((s) => s.text).join('\n')
const sectionOf = (slot, phase, id) => sections.filter((s) => s.slot === slot && s.phase === phase && s.sectionId === id).map((s) => s.text).join('\n')
const normalCombos = Object.fromEntries(got.combos.filter((c) => c.phase === 'normal').map((c) => [c.slot, c.chars]))

const normal = { chair: textOf('chair', 'normal'), member: textOf('member', 'normal'), temp: textOf('temp', 'normal') }
const normalSum = Object.values(normalCombos).reduce((a, b) => a + b, 0)

console.log('### RUN 77 / TB-2725 — the six prompt corrections, asserted on assembled text')

test('§1 #6 the closure vote: the tool is the one entry; the reply field is only a fallback and is silently ignored when the tool is visible', () => {
  for (const [slot, text] of Object.entries(normal)) {
    assert.ok(text.includes('vibe_vmu_vote'), slot + ': names the vote tool')
    assert.ok(text.includes('唯一入口'), slot + ': says it is the one entry')
    assert.ok(text.includes('静默忽略') && text.includes('kept:false'), slot + ': says a visible tool silently ignores the reply field')
    assert.ok(!text.includes('只有它计结题票'), slot + ': the false claim "only it counts the closure vote" is gone')
    assert.ok(!text.includes('结题表决用 `{"vote_solved": true|false}`'), slot + ': the old tool-less instruction is gone')
  }
})

test('§2 #4 the receipt contract is one pointer, not a copied field list, and say\'s three destinations are named', () => {
  const fixture = sectionOf('chair', 'normal', 'v5r-fixture-tools')
  assert.ok(fixture.includes('回执字段目录'), 'the contract points at the generated catalogue section')
  assert.ok(fixture.includes('known fields: …'), 'the refusal hint (known fields) is the pointer, not a hand-copied count')
  assert.ok(fixture.includes('progress / say / solved / vote_solved'), 'the minimal set still names the four fields')
  assert.ok(fixture.includes('未绑') && fixture.includes('错会'), "say's fallback destinations (unbound / wrong meeting id) are named")
  assert.ok(!fixture.includes('四个字段就够'), 'the old "four fields are enough" contradiction is gone')
  assert.ok(!fixture.includes('29 个已登记字段'), 'no hand-copied field count')
})

test('§3 #5 final can hit the office-consult gate right after advance; the warning is in the chair prompt and the old duplicate bullet is gone from the pack', () => {
  const chair = normal.chair
  assert.ok(chair.includes('advance 后可能撞门'), 'chair normal warns that final may hit the gate after advance')
  assert.ok(chair.includes('VMU_OFFICE_CONSULT_REQUIRED'), 'the gate code is named')
  assert.ok(chair.includes('consult'), 'the escape (consult) survives — parity S4b/S5a depend on it')
  assert.equal(chair.split('VMU_OFFICE_CONSULT_REQUIRED').length - 1, 1, 'the gate is taught once in the chair normal prompt (no duplicate bullet)')
  // The paper-final phase is not reachable through the turn harness, so the retired duplicate bullet is asserted
  // absent at its source — the same literal the paper-final section renders.
  const blocks = readFileSync(new URL('../vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js', import.meta.url), 'utf8')
  assert.ok(!blocks.includes('★ 所办问询门（`vmu.paper.officeConsult=required` 时）'), 'the duplicate paper-final bullet is gone (one authoritative sentence in v5r-core)')
})

test('§4 #7 temporary staff attendance is stated once, with the three abilities, and the old contradicting sentence is gone', () => {
  const temp = normal.temp
  assert.equal(temp.split('不入会').length - 1, 1, 'exactly one attendance sentence in the temp prompt')
  assert.ok(temp.includes('vibe_v5_say'), 'chat ability is named')
  assert.ok(!temp.includes('临时工席位不参会'), 'the old wording is gone')
  assert.ok(!normal.chair.includes('不入会'), 'the attendance sentence is not duplicated into the chair prompt')
})

test('§5 #8 close now asks status.present when roster members are absent', () => {
  const chairMeeting = textOf('chair', 'meeting')
  assert.ok(chairMeeting.includes('status.present'), 'close teaching names status.present')
  assert.ok(/close[^。]{0,120}status\.present|status\.present[^。]{0,120}close/.test(chairMeeting), 'the two are taught in the same sentence')
})

test('§6 #9 a failed reply releases the park; the next step opens a new turn', () => {
  for (const [slot, text] of Object.entries(normal)) {
    assert.ok(text.includes('解析失败会释放 park'), slot + ': says a parse failure releases the park')
    assert.ok(text.includes('下条 `step` 开新回合'), slot + ': says the next step opens a new turn')
  }
})

// §7's ceiling is the TB-2725 measurement (77 844 = 77 835 + margin) — that is the size the SIX CORRECTIONS were
// allowed to reach. RUN 270 (Lead) then restored the copy-pasteable `progress` sample TB-2725's receipt-contract merge
// had dropped: +112 per seat, +336 for the three normal assemblies, and it is a correctness fix, not growth for growth's
// sake (in fixtureMode=tools no block a member/temp seat reads had a sample at all). Recorded per seat in
// `tests/vmu-run247-prompt-dedup.test.mjs` and `tests/vmu-run256-prompts-compress.test.mjs`; here only the ceiling moves.
const RUN270_PROGRESS_SAMPLE = { chair: 112, sum: 336 }
test('§7 the corrections did not grow the prompts: three-seat normal sum ≤ the TB-2725 baseline (77844) + the RUN 270 sample', () => {
  assert.equal(Object.keys(normalCombos).length, 3, 'three seats measured (a shrunken set would pass vacuously)')
  const sumCeiling = 77844 + RUN270_PROGRESS_SAMPLE.sum
  const chairCeiling = 29455 + RUN270_PROGRESS_SAMPLE.chair
  assert.ok(normalSum <= sumCeiling, 'three-seat normal sum ' + normalSum + ' ≤ ' + sumCeiling)
  assert.ok(normalCombos.chair <= chairCeiling, 'chair/normal ' + normalCombos.chair + ' ≤ ' + chairCeiling)
})
