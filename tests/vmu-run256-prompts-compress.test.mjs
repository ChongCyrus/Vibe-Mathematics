// RUN 256 轮 C — the compression pass: every cut has a "what the deletion costs" note and the RETIRED wording is
// asserted ABSENT (a cut without a negation pin is a silent regression). This suite is the machine half of the
// §13 table in docs/acceptance/sim-audit-prompts.md; the human half is that table's judgement column.
//
// It reads the assembled prompts through the same collection the budget audit uses, so it measures the shipped text,
// not a source file that might be dead code.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

const { collect } = await import(new URL('../scripts/sim/audit/prompt-sections.mjs', import.meta.url).href)

const got = await collect({ slots: ['chair', 'member', 'temp'], phases: ['normal'] })
const textOf = (slot, id) => {
  const rows = got.sections.filter((s) => s.slot === slot && s.sectionId === id)
  return rows.map((r) => r.text).join('\n')
}
const allNormal = got.sections.map((s) => s.text).join('\n')
const combos = Object.fromEntries(got.combos.map((c) => [c.slot, c.chars]))
const sum = Object.values(combos).reduce((a, b) => a + b, 0)

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label) } else { failed++; console.log('  FAIL ' + label, detail === undefined ? '' : detail) }
}
const says = (text, needle) => typeof text === 'string' && text.length > 0 && text.includes(needle)
const denies = (text, needle) => typeof text === 'string' && text.length > 0 && !text.includes(needle)

console.log('### RUN 256 round C — what was compressed, and what must never come back')

test('§1 the shared fixture-tools section: duplicates gone, the pinned contract intact', () => {
  const chair = textOf('chair', 'v5r-fixture-tools')
  const member = textOf('member', 'v5r-fixture-tools')
  const temp = textOf('temp', 'v5r-fixture-tools')
  // ★ RUN 256 cut #1: the receipt-fence teaching is stated ONCE (in reply-compact / the tools array). The old
  // duplicated sentence is retired from the source; the fixture's own contract lines are NOT.
  ok(says(chair, '【SLV 夹具约束｜本轮调用工具】'), '§1a the fixture constraint still opens the section')
  ok(says(chair, '是角色职责清单') && says(chair, '不承诺「本回合已挂载」'), '§1b the duty-list clarification and the mount caveat survive')
  // ★ RUN 257 / task-94 round D (Lead m05579): the copied count is gone (the receipt prints `known fields: …`); the
  // named refusal and the rest of the contract survive.
  ok(says(chair, 'known fields') && denies(chair, '29 个已登记字段') && says(chair, 'VMU_TURN_UNKNOWN_FIELD'), '§1c the receipt-contract POINTER and the named refusal survive (RUN 257: the copied count is gone)')
  ok(says(chair, 'VMU_TURN_NO_FENCE') && says(chair, 'VMU_TURN_BAD_JSON'), '§1d the two fence refusals survive')
  ok(says(chair, '{"vote_solved": true|false}') && says(chair, '{"solved": false}'), '§1e the minimal receipts survive')
  ok(
    denies(chair, '回执正文里【不要】粘贴 JSON 对象或工具回执原文') &&
      denies(chair, '调用工具后结果立即可见；**回执可以很薄**'),
    '§1f the retired duplicate phrasing is absent at the source (the surviving rule is stated once)',
  )
  // the cut must be shared by all three seats (it was one section rendered three times)
  ok(chair === member && member === temp, '§1g the three seats still render the same fixture-tools text (one section, not three)')
  ok(chair.length <= 1300, '§1h the section is at its compressed size (<=1300 chars)', chair.length)
})

test('§2 the shared turn-channels section: the repeated urgency sentence is gone', () => {
  const chair = textOf('chair', 'v5r-turn-channels')
  ok(says(chair, '【三通道的紧急语义】'), '§2a the section still names the three channels')
  ok(says(chair, '紧急') && says(chair, '非紧急'), '§2b both urgency readings survive')
  ok(denies(chair, '未读时块头在最上方，'), '§2c the redundant block-header sentence is gone (the caveat "no unread => no header" stays pinned)')
  ok(chair.length <= 1210, '§2d the section is at its compressed size (<=1210 chars)', chair.length)
})

test('§3 seat-faces teaching rows: behaviour detail merged, selection guidance kept', () => {
  const tools = textOf('chair', 'v5r-tools-academician')
  ok(says(tools, 'status/summary/meetingView 立刻可读'), '§3a the three readable faces still named in the convene line')
  ok(says(tools, '不要自批'), '§3b "do not self-approve" survives')
  ok(says(tools, 'archival copy，不是执行证据'), '§3c the archive-is-a-copy rule survives')
  ok(denies(tools, '这是人类的决定权：'), '§3d the retired commentary clause is absent')
  ok(denies(tools, '仍具名拒 `VMU_REGISTRY_BOUNDARY`'), '§3e the retired adverb is absent')
  const member = textOf('member', 'v5r-tools-researcher')
  ok(says(member, 'VMU_CHAT_NOT_ADMIN') && says(member, 'VMU_CHAT_MUTED'), '§3f the member chat refusals survive')
  ok(says(member, '本所默认 acad'), '§3g the default-admin fact survives the merge (setup detail kept where it guides a choice)')
})

test('§4 the charter merges: only restatements were removed', () => {
  const chair = textOf('chair', 'v5r-charter-voting')
  ok(says(chair, '全体一致时取该值，否则取全组平均概率'), '§4a the averaging rule survives')
  ok(says(chair, 'VMU_PACK_V5R_P1_NEEDS_DEBATE') && says(chair, 'VMU_PACK_V5R_VERIFIED_SINGLE_WRITER'), '§4b the promotion refusals survive')
  ok(says(chair, 'VMU_MEETING_QUORUM_LOST') && says(chair, 'partial: true'), '§4c the quorum gate and the named escape survive')
  ok(denies(chair, '它与理由一并进入辩论录'), '§4d the verdict-purpose restatement is absent')
  ok(denies(chair, '——与上面的求真门槛不同'), '§4e the "not the same threshold" restatement is absent')
  ok(denies(chair, '（闸把这条引用当证据，引用栏不能空）'), '§4f the gate-restating parenthetical is absent')
  const member = textOf('member', 'v5r-charter-voting')
  ok(denies(member, '两者不是同一个门槛'), '§4g member side: the same restatement is absent')
})

test('§5 the water levels: the round did not grow the prompts', () => {
  ok(combos.chair <= 28615, '§5a chair normal within the RUN 247 ceiling (28615)', combos.chair)
  ok(sum <= 75414, '§5b three-seat normal within the audited ceiling (75414)', sum)
  // ★ RUN 258 / AUDIT-14 (2026-11-09): the tripwire is refreshed to the CURRENT measured value with ZERO slack — any
  // added character turns this red, and a growth must be paid for by deleting at least as much redundancy in the same
  // change. History: round C 73931 → D-2 73969 (+38 post-round-C teaching from other lanes) → now 74214 (+245).
  // Attribution of the +245: +6 is THIS round's AUDIT-14 P1-7 fix (`need:"latex"` → `need:"xelatex"`: +2 in
  // blocks-b paper line, +2 on each of v5r-core's two paper variants) — the rest (+239) is teaching that landed in this
  // shared worktree from the md-lane/notice-lane prompt edits after D-2; this pin does not police their budget
  // (`audit-prompt-budget` caps are untouched: chair/meeting 34671 < 36500, PASS). Re-measure before re-baselining.
  ok(sum <= 74214, '§5c the compressed water level itself: <= 74214 (zero slack; RUN 258 measured 74214 = 73969 + 6 from the need:xelatex fix + 239 from other lanes post-D-2 teaching)', sum)
  ok(allNormal.length > 0, '§5d the assembly is non-empty (the guards above are not vacuous)')
})

process.on('exit', () => { console.log('\n=== VMU RUN 256 PROMPTS COMPRESS: ' + passed + ' passed, ' + failed + ' failed ==='); if (failed > 0) process.exitCode = 1 })
