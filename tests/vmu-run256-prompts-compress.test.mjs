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

// ★ TB-2705 (2026-11-10) — the three water levels are RE-DERIVED from a measurement, never hand-tuned.
// Each baseline is `measured + max(1%, 3 chars)`; the margins and the attribution live here, next to the numbers,
// so the next round must re-derive instead of bumping an integer. What made the old pins lie was not the number:
// it was that legal teaching and returning duplication shared one silent number.
// Diagnostics (docs/acceptance/prompt-budget-tripwires.md): HEAD 92bc6d94 measured fixture-tools 1291 and the
// three-seat normal sum 74047. TB-2692 then added teaching (+164 in this section: the four shape codes, V7) and
// +1566 across the normal prompts, and this round deleted the one real duplication it found — the UNKNOWN_FIELD
// sentence was stated twice inside the SAME section (once here, once in the receipt-contract line below): −46.
const RUN2730_REPLY_QUALIFIER = { chair: 28, member: 28, temp: 28, sum: 84 } // TB-2733 prep: the member-facing op:"reply" teaching became an explicit prohibition (VMU_NOT_PERMITTED) and the caller sentence got its office qualifier; the shared fixture block paid for it by trimming restatements (net +24 vs the D5 restore)
const FIXTURE_TOOLS_MEASURED = 1388 // 1291 + 164 (TB-2692) − 46 (deleted duplication) + 176 (TB-2711 office attribution) − 59 (TB-2725 receipt-contract merge) + 112 (RUN 270: the copy-pasteable progress sample TB-2725 merged away, restored — in fixtureMode=tools it had been left in no block a member/temp seat reads) − 14 (TB-2732: D4/D7/C10 restatements merged; the pinned duty-list caveat stays) − 177 (TB-2741: RUN-79 corrections merged the receipt-contract / reply-path / vote-channel restatements; the say destinations came back in 25 chars) + 15 (RUN 272: TB-2741's reword had dropped the load-bearing clause 「形状问题不等于引擎不可用」 — a fence/JSON error is not a broken toolchain, and a seat that reads it as one stops working and starts probing the engine; restored inside the same sentence)
const FIXTURE_TOOLS_MARGIN = Math.max(Math.ceil(FIXTURE_TOOLS_MEASURED * 0.01), 3) // 16
const FIXTURE_TOOLS_CEILING = FIXTURE_TOOLS_MEASURED + FIXTURE_TOOLS_MARGIN // 1601
// ★ TB-2707 (2026-11-10) — F75-16 archive sentence: the shared `v5r-turn-channels` block went from the
// unconditional 「全文落 Members/…/Turns/<turn>.md」 to the conditional/checkable/named-failure sentence.
// Measured per seat: 169 → 324 chars ⇒ +155 (the design note estimated 152→305 ≈ +153; the real render is +155).
// Shared block ⇒ all three seats pay it once: +465. This is TEACHING (it closes a real-machine defect where a
// reader looked for a file that never existed), accounted for line by line — no teaching was deleted to pay for it.
const RUN2707_ARCHIVE_SENTENCE = { chair: 155, member: 155, temp: 155, sum: 465 }
// ★ RUN 260 / TB-2699 (2026-11-10) — the office-consult gate escape was taught into the CHAIR prose only
// (`v5r-core.js` V5R_PROSE_CHAIR paper line): when `final` is refused with `VMU_OFFICE_CONSULT_REQUIRED`, let the
// office answer `vibe_v5_paper { action:"consult", … }`, then retry `final`. Measured +94 chars, one seat (chair),
// in every phase that carries the chair tool section ⇒ chair/normal and the three-seat sum each +94.
const RUN260_CONSULT_TEACHING = { chair: 94, sum: 94 }
// ★ TB-2711 (2026-11-10) — the paper flow sentence gained `final` (`final` compiles and writes the pdf line,
// `render` never compiles). Per seat: chair +3, member +3, temp +38 (temp had the shortest line), sum +44.
const TB2711_FINAL_STEP = { chair: 362, member: 362, temp: 399, sum: 1123 }
const TB2717_PHASE_STEP = { chair: 229, member: 229, temp: 229, sum: 687 } // TB-2717: the closed four-name phase set (shared `v5r-turn-tracks` block, 228 chars + the joining newline), one copy per seat
const TB2725_CORRECTIONS = { chair: 19, member: -1, temp: -27, sum: -9 } // TB-2725: six RUN-77 corrections, net ≤0 (fixture contract merged, vote channel fixed, temp attendance merged, close/park one-liners)
const RUN2730_D5 = { chair: -29, member: -29, temp: -29, sum: -87 } // TB-2730 shipped: the reply vote is counted only when the turn provably did not mount the tool; the prompt now names kept:false + the five keptWhy values. Paid for by merging restatements in shared v5r-fixture-tools (net -27 vs TB-2732).
const TB2732_DEDUP = { chair: -8, member: -8, temp: -8, sum: -24 } // TB-2732 (RUN 78): seven corrections, net ≤0 — every added sentence paid for by merging a restatement in shared v5r-fixture-tools
// RUN 270 (Lead) — TB-2725's merge dropped the copy-pasteable `progress` sample with the contract line; in
// fixtureMode=tools that left member/temp with NO sample anywhere (measured). Restored as one 111-char line (+newline)
// in the shared `v5r-fixture-tools` block: +112 per seat, +336 for the three normal assemblies.
const RUN270_PROGRESS_SAMPLE = { chair: 112, member: 112, temp: 112, sum: 336 }
// ★ TB-2741 (2026-11-11) — RUN 79's ten corrections, net ≤0: proof_ref root example, vote_solved bookkeeping wording,
// "example not whitelist", no always-renders blueprint promise, per-face phase naming, draft row/file split, merged
// action boundary, kernel-injected status board, one tool_help authority, next_step as advice. Every added sentence was
// paid for by merging restatements in the shared fixture / tracks blocks: −4 per seat, −12 for the three normals
// (measured 29 491→29 469 / 25 993→25 971 / 22 660→22 638).
const TB2741_CORRECTIONS = { chair: -22, member: -22, temp: -22, sum: -66 }
// ★ RUN 272 (2026-11-12, Lead) — RUN 79's V1 attribution batch: TB-2741's #5 correction had dropped the parenthetical
// `（旧任务书简写）` after the legacy short phase name, which is the anchor `tests/vmu-run77-prompt-phase-and-votes`
// pins (RUN 76's short-name relapse). Restoring it costs 8 chars per seat in the shared `v5r-turn-polls` block
// (measured 29 469→29 477 / 25 971→25 979 / 22 638→22 646; sum 78 078→78 102). A label that names the trap is not
// decoration: without it a seat cannot tell a legacy spelling from this face's closed set.
// ★ RUN 272 measured per seat: +30, three load-bearing clauses TB-2741's dedup had dropped or that the gates
// caught as unpinned. (a) +8 in the shared polls block: the 「（旧任务书简写）」 label that names the legacy phase spelling
// (the anchor `tests/vmu-run77-prompt-phase-and-votes` pins against a short-name relapse). (b) +14 in the shared
// fixture-tools section: 「形状问题不等于引擎不可用」 — a fence/JSON error is not a broken toolchain, and a seat that reads it
// as one stops working and starts probing the engine. (c) +8 in the same polls block: 「别自己数人头（vote_solved）」 — the
// closure denominator is the enfranchised seats, so a hand count is wrong in exactly the case the line is about.
// Every one is a fact a seat must read; none is decoration. 29469+30 = 29499 per seat, 78078+90 = 78168 for the
// three normals (live, measured after the restore).
const RUN272_RUN79_RESTORE = { chair: 30, member: 30, temp: 30, sum: 90 }
// ★ TB-2752 (2026-11-12) — RUN 80’s four prompt corrections, all inside `packs/v5r/prompts/**` plus the one
// seat-faces bullet that renders into the chair tool list. REWRITTEN after the prompt-lane review (the first version
// taught a mechanism that does not exist — see F80-4 below).
// F80-3 (+6 chair, tool list): the chair paper-flow bullet went from `start→part→advance→review→render` to
// `start→part→advance→review→final→render` (seat-faces.js); the paper-review guide states that
// `judgedPartFingerprint` / `judgedPartRound` are RECEIPT fields the kernel binds, not parameters — passing them is
// refused `VMU_INVALID_ARGUMENT`. The same sentence was rendered twice in the paper-review assembly; the duplicate was
// deleted (the copy in `v5r-blocks-b.js` is kept, the paragraph-identical one in `v5r-paper-prompts.js` is gone).
// F80-4 (0 in these water levels: `collect()` assembles normal/meeting only, paper-write/paper-review are outside the
// ruler; source text grew and is NOT counted here): `evidence` now teaches the REAL contract — two spellings name the
// same record (the bare id `rec-<n>`, or a member-file path whose filename IS the record id); self-chosen file names
// and prose summaries are what the gate refuses. The first fix said "record ids only, no paths", which
// `checkEvidencePointers` never implemented (it resolves the member-file form) — a false absolute plus a dangling
// 「按上一条…」, both removed.
// F80-12 (+45 chair and +45 member, plus the +6 chair tool line = +51/+45); the roster bullet keeps a SHORT
// checkable negative (what the temp does NOT write) because G7 C1b reads THAT bullet, not the shared section.: the roster derives attendance from
// `vmu.meetings.attendDeniedSeats` AND says vote rights are decided by `vmu.meetings.eligibleSeats` — two keys, two
// mechanisms. The first wording said 「不表决」 as if attendance decided the vote, which the vote gate does not do.
// F80-8 (0 here): the office identity is hostPrompt-only, so it enters no seat normal — not counted in these water
// levels; its correction is pinned by the new judge against `assistant.json` directly.
// Measured per seat after the C1b restore: chair 29 499→29 550 (+51), member 26 001→26 046 (+45), temp 22 668 (0);
// three-seat sum 78 168→78 264 (+96), still inside the taskbook's +120 envelope (24 chars of room). No cap raised.
const TB2752_RUN80_FIXES = { chair: 51, member: 45, temp: 0, sum: 96 }
const CHAIR_NORMAL_MEASURED = 28529 + RUN2707_ARCHIVE_SENTENCE.chair + RUN260_CONSULT_TEACHING.chair + TB2711_FINAL_STEP.chair + TB2717_PHASE_STEP.chair + TB2725_CORRECTIONS.chair + RUN270_PROGRESS_SAMPLE.chair + TB2732_DEDUP.chair + RUN2730_D5.chair + RUN2730_REPLY_QUALIFIER.chair + TB2741_CORRECTIONS.chair + RUN272_RUN79_RESTORE.chair + TB2752_RUN80_FIXES.chair // 29547
const CHAIR_NORMAL_MARGIN = Math.max(Math.ceil(CHAIR_NORMAL_MEASURED * 0.01), 3) // 296
const CHAIR_NORMAL_CEILING = CHAIR_NORMAL_MEASURED + CHAIR_NORMAL_MARGIN // 29843
const NORMAL_SUM_MEASURED = 75475 + RUN2707_ARCHIVE_SENTENCE.sum + RUN260_CONSULT_TEACHING.sum + TB2711_FINAL_STEP.sum + TB2717_PHASE_STEP.sum + TB2725_CORRECTIONS.sum + RUN270_PROGRESS_SAMPLE.sum + TB2732_DEDUP.sum + RUN2730_D5.sum + RUN2730_REPLY_QUALIFIER.sum + TB2741_CORRECTIONS.sum + RUN272_RUN79_RESTORE.sum + TB2752_RUN80_FIXES.sum // 78272
const NORMAL_SUM_MARGIN = Math.max(Math.ceil(NORMAL_SUM_MEASURED * 0.01), 3) // 783
const NORMAL_SUM_CEILING = NORMAL_SUM_MEASURED + NORMAL_SUM_MARGIN // 79055

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
  ok(says(chair, '{"solved": false}') && says(chair, '只走工具') && says(chair, 'fieldsIgnored'), '§1e the minimal receipts survive (the tool is the vote channel; the reply field only reports)')
  ok(
    denies(chair, '回执正文里【不要】粘贴 JSON 对象或工具回执原文') &&
      denies(chair, '调用工具后结果立即可见；**回执可以很薄**'),
    '§1f the retired duplicate phrasing is absent at the source (the surviving rule is stated once)',
  )
  // the cut must be shared by all three seats (it was one section rendered three times)
  ok(chair === member && member === temp, '§1g the three seats still render the same fixture-tools text (one section, not three)')
  ok(chair.length <= FIXTURE_TOOLS_CEILING, '§1h the section is at its compressed size (<= ' + FIXTURE_TOOLS_CEILING + ' = measured ' + FIXTURE_TOOLS_MEASURED + ' + max(1%,3) margin ' + FIXTURE_TOOLS_MARGIN + '; TB-2705)', chair.length)
  // ★ TB-2705 §1h3 — WHY an exact pin next to a tolerated ceiling: the ceiling is `measured + max(1%,3)`, so a
  // baseline lowered by one char would still pass the ceiling (the margin eats it) and the accounting would lie.
  // This assertion is the anti-lamp for 「基线改小 1 字符」: the recorded measurement must equal the live section.
  ok(
    chair.length === FIXTURE_TOOLS_MEASURED,
    '§1h3 the recorded measurement is the live section length (a change must re-baseline the accounting, even +1 char; the ceiling alone cannot see it)',
    { live: chair.length, recorded: FIXTURE_TOOLS_MEASURED },
  )
  // ★ TB-2705 §1h2 — the DUPLICATION dimension, not a length dimension: a section is allowed to grow for a new
  // fact, but the SAME fact stated twice is exactly what RUN 247 spent a task deleting. Machine form: every named
  // refusal code in this shared section may be taught at most once. Injecting a second mention of any code turns
  // this red even when the length is still under the ceiling.
  const codeCounts = {}
  for (const m of chair.matchAll(/VMU_[A-Z0-9_]+/g)) codeCounts[m[0]] = (codeCounts[m[0]] || 0) + 1
  const repeatedCodes = Object.entries(codeCounts).filter(([, n]) => n > 1)
  ok(repeatedCodes.length === 0, '§1h2 duplication counter: no refusal code is taught twice in the same fixture-tools section', JSON.stringify(repeatedCodes))
})

test('§2 the shared turn-channels section: the repeated urgency sentence is gone', () => {
  const chair = textOf('chair', 'v5r-turn-channels')
  ok(says(chair, '【三通道的紧急语义】'), '§2a the section still names the three channels')
  ok(says(chair, '紧急') && says(chair, '非紧急'), '§2b both urgency readings survive')
  ok(denies(chair, '未读时块头在最上方，'), '§2c the redundant block-header sentence is gone (the caveat "no unread => no header" stays pinned)')
  // §2d 的基线按同样口径重定：TB-2705 诊断时实测 1159（RUN 256 压缩后），TB-2707 把无条件的归档句换成
  // 「仅当 truncated:true／写完回读校验／archiveMissing 具名失败」后实测 1314（+155，逐条记账见上面
  // RUN2707_ARCHIVE_SENTENCE 注释）。上限 = 实测 + max(1%, 3) 余量，不为教学让路而删句子。
  const CHANNELS_MEASURED = 1332 // TB-2711: notices empty-block sentence (+18)
  const CHANNELS_MARGIN = Math.max(Math.ceil(CHANNELS_MEASURED * 0.01), 3) // 14
  const CHANNELS_CEILING = CHANNELS_MEASURED + CHANNELS_MARGIN // 1328
  ok(chair.length <= CHANNELS_CEILING, '§2d the section is at its compressed size (<= ' + CHANNELS_CEILING + ' = measured ' + CHANNELS_MEASURED + ' + margin ' + CHANNELS_MARGIN + '; TB-2707 +155)', chair.length)
  // the exact pin (see §1h3): a 1-char lowering of the baseline must be visible, not absorbed by the margin
  ok(chair.length === CHANNELS_MEASURED, '§2e the recorded measurement is the live section length (a change must re-baseline the accounting, even +1 char)', { live: chair.length, recorded: CHANNELS_MEASURED })
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
  ok(combos.chair <= CHAIR_NORMAL_CEILING, '§5a chair normal within the audited ceiling (' + CHAIR_NORMAL_CEILING + ' = measured ' + CHAIR_NORMAL_MEASURED + ' + margin ' + CHAIR_NORMAL_MARGIN + '; TB-2705 re-derivation, TB-2707 +155)', combos.chair)
  // ★ TB-2705 (2026-11-10): §5b and §5c are both re-derived from the SAME measurement by the formula above.
  // §5b is the audited ceiling (measured + max(1%,3) margin; legal teaching has room, duplication does not get
  // a free pass because §1h2 / §3 / §4 count it structurally). §5c is the same re-derivation kept as the second
  // site: a future edit that bumps one but forgets the other is caught by the tighter of the two. Attribution:
  // 「本轮因 TB-2692（F75-03 题目硬规则、归属口径、四个形状码、parked、REACHABLE INSTEAD）增长 1566 字符，
  // 其中 1428 是教学、138（=46×3 席）是已删重复（本轮的 K）」— the deleted 46 is the UNKNOWN_FIELD duplication in
  // v5r-fixture-tools, which is shared by all three seats.
  ok(sum <= NORMAL_SUM_CEILING, '§5b three-seat normal within the audited ceiling (' + NORMAL_SUM_CEILING + ' = measured ' + NORMAL_SUM_MEASURED + ' + margin ' + NORMAL_SUM_MARGIN + '; TB-2705)', sum)
  // ★ RUN 258 / AUDIT-14 (2026-11-09): the compressed water level — kept as its own pin so a round must consciously
  // re-derive it. History: round C 73931 → D-2 73969 (+38 post-round-C teaching from other lanes) → RUN 258 74214
  // (+245) → TB-2692 teaching → TB-2705 re-derivation to the value above.
  ok(sum <= NORMAL_SUM_CEILING, '§5c the compressed water level itself: <= ' + NORMAL_SUM_CEILING + ' (= measured ' + NORMAL_SUM_MEASURED + ' + max(1%,3) margin ' + NORMAL_SUM_MARGIN + '; TB-2705 re-derivation, the same value as §5b on purpose)', sum)
  // ★ TB-2705 §5d — the exact pins that make 「基线改小 1 字符」 visible (the margin would otherwise swallow it):
  // the two recorded measurements ARE the live ones; any change, even +1 char, must re-baseline the accounting.
  ok(
    combos.chair === CHAIR_NORMAL_MEASURED && sum === NORMAL_SUM_MEASURED,
    '§5d the recorded measurements are the live ones (any change, even +1 char, must re-baseline the accounting; the ceiling is derived, not hand-tuned)',
    { chair: combos.chair, recordedChair: CHAIR_NORMAL_MEASURED, sum, recordedSum: NORMAL_SUM_MEASURED },
  )
  ok(allNormal.length > 0, '§5d the assembly is non-empty (the guards above are not vacuous)')
})

process.on('exit', () => { console.log('\n=== VMU RUN 256 PROMPTS COMPRESS: ' + passed + ' passed, ' + failed + ' failed ==='); if (failed > 0) process.exitCode = 1 })
