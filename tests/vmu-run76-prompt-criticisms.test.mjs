// TB-2711 / RUN 76 — the prompt-side defects of the 76th live run.
//
// The flagship one (SIM-REPORT76 §④ 9, hit twice in the machine: r-1 rec-20, r-2 rec-23) was that the peer-review
// section assembled into an EMPTY TEMPLATE: the author printed as the literal `(unspecified)` and the body between
// the two dashed rules was 0 chars, while `vibe_v5_paper {action:"status"}` already knew `reviewOf` and
// `parts.r-2=rec-10` was readable.
//
// WHY THE FIX IS TEACHING, NOT INLINE FILL (the taskbook's own fallback §6): the prompt pipeline can only render
// the whitelisted variables (`kernel/prompt/index.js` VARIABLE_WHITELIST: member/role/roleLabel/phase/time/pack/
// task/roster/round/quorum/statusBlock/setting:/count:) — a section's text is a static string, and the paper rows
// (parts recordIds, bodies) are NOT on the assembly context at all; only the derived `[状态板]` detail is. Writing
// an `appendPrompt` producer would need a middleware/host file outside this task's write domain. So the section now
// teaches the THREE reachable hops (status -> recordId -> expand), names the truncation re-pull, and never prints an
// empty dashed block or `(unspecified)`.
//
// Run: node tests/vmu-run76-prompt-criticisms.test.mjs
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'

import { CHARTER_SECTIONS, CHARTER_BINDINGS } from '../vibe-math-vmu/packs/v5r/prompts/v5r-charter.js'
import { v5rToolSectionAcademician, v5rToolSectionResearcher, v5rToolSectionTemp } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { createTurnOrchestrator } from '../vibe-math-vmu/kernel/turn/index.js'
import { decideSections } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'
import { inboxBlock } from '../vibe-math-vmu/packs/v5r/notices.js'

const SETTINGS = {
  'vmu.turn.instituteName': 'institute', 'vmu.turn.objective': 'probe', 'vmu.turn.leaderId': 'acad',
  'vmu.turn.maxParallel': 3, 'vmu.turn.toolCallsPerTurnCap': 0, 'vmu.turn.memoryCeilingMb': 0,
  'vmu.pointer.propagation': true, 'vmu.turn.feedback': true, 'vmu.meetings.verdictMaxRounds': 3,
  'vmu.turn.replyCatalogue': 'compact',
  'vmu.turn.protocolPath': 'VibeMath/Projects/default/Institutes/institute/Shared/Protocol.md',
  'vmu.turn.verifyTarget': 'p-lemma-a', 'vmu.turn.verifyKindLabel': '命题',
  'vmu.turn.formalRootRel': 'VibeMath/Projects/default/Institutes/institute/Formal/',
  'vmu.turn.meetingId': 'mt-1',
  // DELIBERATELY NOT SET: `vmu.paper.reviewedMember`. The machine run showed nothing ever writes it, so a section
  // that depends on it can only print `(unspecified)`. The new text must not depend on it.
}
const loop = createTurnOrchestrator({
  prompt: createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_BINDINGS, clock: () => '2026-01-01T00:00:00.000Z' }),
  settings: SETTINGS,
  sectionPolicy: decideSections,
  noticeBlock: inboxBlock,
  extraPhases: ['heartbeat', 'paper-write', 'paper-review', 'paper-final'],
})
const SEATS = [
  { member: 'acad', role: 'academician', roleLabel: '院士' },
  { member: 'r-1', role: 'researcher', roleLabel: '研究员' },
  { member: 't-1', role: 'temp', roleLabel: '临时工' },
]
const texts = {}
for (const seat of SEATS) {
  for (const phase of ['normal', 'paper-review', 'paper-final']) {
    const a = await loop.assemble(loop.open(Object.assign({ phase, roster: 'acad、r-1、t-1', quorum: 2, statusBlock: '[状态] x', round: 3 }, seat)).turn)
    texts[seat.member + '/' + phase] = String(a.text)
  }
}
const all = Object.values(texts).join('\n')
// The role tool prose is a HOST-ROOT section (the turn pipeline carries `effective-tools` placeholders instead), so
// its assembled form is the declared section text — the same string host.js puts in the root system prompt.
const toolProse = [v5rToolSectionAcademician, v5rToolSectionResearcher, v5rToolSectionTemp].map((s) => s.text).join('\n')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label) } else { failed++; console.error('  FAIL ' + label, detail === undefined ? '' : detail) }
}
const says = (t, n) => typeof t === 'string' && t.includes(n)
const denies = (t, n) => typeof t === 'string' && !t.includes(n)

test('§1 the peer-review section is no longer an empty template', () => {
  const review = texts['acad/paper-review']
  // ① no literal placeholder author anywhere in any assembled prompt
  ok(denies(all, '(unspecified)'), 'no assembled prompt prints the literal (unspecified)')
  ok(denies(all, '{{ setting:vmu.paper.reviewedMember }}'), 'no prompt still carries the unresolved reviewedMember slot')
  // ② author + part recordId are NAMED as things to read, not as blanks
  ok(denies(review, '------------'), 'the review section has no dashed empty-body frame')
  ok(says(review, 'reviewOf'), 'the review brief names reviewOf as the author pairing')
  ok(says(review, 'parts'), 'the review brief names parts as the part recordIds')
  ok(says(review, 'rec-10'), 'the review brief carries a concrete part recordId example')
  // ③ the three hops are the explicit recipe, and truncation has a reachable repair
  ok(says(review, 'vibe_v5_paper { action:"status"'), 'hop 1: status is named as the reachable read')
  ok(says(review, 'vibe_vmu_records { action:"expand", id:"rec-10" }'), 'hop 2: expand is a copyable call')
  ok(says(review, 'truncated'), 'truncated body is named')
  ok(says(review, '按 rec id 重拉'), 're-pull by rec id is the stated repair')
  ok(says(review, '三步') || says(review, '逐条判断'), 'the brief carries the recipe, not a blank body')
})

test('§2 one closure-ballot entry name: vote_solved (registered); set_solved is not taught as a call', () => {
  ok(says(all, 'vote_solved'), 'vote_solved is taught')
  // The closure-comparison teaching lives in the meeting-scope section (`v5r-turn-meeting-schedule`), which is
  // not part of the paper-phase assembly above; that section is static, so its declared text IS its assembled text.
  // Reading it too keeps the rule from passing vacuously on an empty set.
  const closureText = CHARTER_SECTIONS.filter((s) => typeof s.text === 'string' && s.text.includes('set_solved')).map((s) => s.text).join('\n')
  const lines = (all + '\n' + closureText).split('\n').filter((l) => l.includes('set_solved'))
  ok(lines.length > 0 && lines.every((l) => /未登记|已废|不要用/.test(l)), 'any mention of set_solved is a negative one', JSON.stringify(lines.slice(0, 2)))
  ok(denies(all, '"set_solved": true'), 'set_solved is never offered as a shape to write')
  const src = readFileSync(new URL('../vibe-math-vmu/packs/v5r/prompts/v5r-reply-channel.js', import.meta.url), 'utf8')
  ok(says(src, '唯一入口') && says(src, '`set_solved` 未登记'), 'the reply catalogue states the one entry and names the wrong one')
})

test('§3 the paper flow names final and says which step compiles', () => {
  ok(says(toolProse, 'start→part→advance→review→final→render'), 'final sits in the flow sentence')
  ok(says(toolProse, '`final`（**仅 chair 席**）才编译') || /final.*才编译/.test(toolProse), 'final is the step that compiles')
  ok(says(toolProse, '`render` **永不编译**'), 'render never compiles')
})

test('§4 the taught tool names really exist (prompt is a promise)', () => {
  const host = readFileSync(new URL('../vibe-math-vmu/host.js', import.meta.url), 'utf8')
  ok(host.includes("'expand'"), 'records face really offers action expand')
  ok(host.includes('vibe_vmu_records'), 'the records tool face really is vibe_vmu_records')
})

test('§5 the other RUN 76 criticisms are renderer contracts, taught where the reader meets them', () => {
  const shared = texts['acad/normal']
  // status board: three fixed columns, and a missing timestamp must be NAMED rather than left blank
  ok(says(shared, '「读数｜来源｜取值时刻」'), 'the status board template is three named columns')
  ok(says(shared, '时间未提供') || says(shared, '具名理由'), 'a missing timestamp must be named, not blank')
  // [蓝图] is rendered even when there is no live revision (the kernel reading is TB-2712's; this asserts the contract)
  ok(says(shared, '[蓝图] 无现行版（rev 0，md 未落盘）'), 'the blueprint line names its empty instead of vanishing')
  ok(says(shared, '恒渲染') || says(shared, '不会因为'), 'the blueprint contract is stated, not implied')
  // notices: no silent disappearance when nothing is unsettled
  ok(says(shared, '[新到的消息] （无未结算行）'), 'an empty notice block is named rather than omitted')
  ok(denies(shared, '无未读则**不出现块头**'), 'the old silent-disappearance rule is gone')
  // peer review: the section names what the assembler must inject, so a skeleton is never mistaken for content
  const review = texts['acad/paper-review']
  ok(says(review, '审阅对象') && says(review, 'partText'), 'the assembler injection contract is stated in the section')
  ok(says(review, '1600'), 'the truncation budget is stated')
  ok(says(review, '未注入'), 'an unfilled section is named as not-injected rather than read as empty')
  ok(says(review, '请你审阅'), 'the corpus sentence the coverage gate counts is preserved verbatim')
})

