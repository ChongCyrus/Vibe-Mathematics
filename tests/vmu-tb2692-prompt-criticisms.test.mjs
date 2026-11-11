// TB-2692 — the RUN 75 prompt criticisms, held as machine checks against the REAL assembled text.
//
// The rule this file enforces: a criticism is only closed when the text a seat actually reads says the right
// thing. Assertions below therefore read the harness assembly (prompts.assembleFor) or the kernel prompt
// pipeline (paper phases, which the turn loop refuses to open because they are pack-declared), never the
// source of a prompt module.
//
// Items 9 (notice block precedes the identity block) and 12 (the 【更正】 sections quote the obsolete sentence
// they replace) are NOT taught in this file: both are dispositions REJECTED for the prompt layer, and the
// reasons are pinned at the bottom against the mechanism that owns them.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// The checkout is derived from this module's own location (never hard-coded): the audit-portability gate
// rejects criteria that borrow a fact from one machine's filesystem.
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')
const PROBLEM = '$a^2+b^2\\ge 2ab$（占位题，只作象征，不要真解）'

let passed = 0
const fails = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; return }
  fails.push({ label, detail })
  console.log('FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
}
const has = (text, needle, label) => ok(String(text).includes(needle), label, needle)

const H = await import(pathToFileURL(join(REPO, 'scripts', 'sim', 'harness.mjs')).href)
const root = mkdtempSync(join(tmpdir(), 'tb2692-test-'))
const h = await H.boot({ root, clock: () => Date.parse('2026-11-10T00:00:00.000Z'), withPrompt: true, settings: { 'vmu.turn.objective': PROBLEM } })
await h.call('vibe_v5_start', { researcherCount: 3, problem: PROBLEM })
const convened = await h.call('vibe_v5_meeting', { member: 'r-acad', agenda: ['确认命题'], title: 'TB-2692 evidence meeting', type: 'ordinary' })
const MID = String(convened.meeting || convened.id || '')

const chairNormal = await h.prompts.assembleFor({ seat: 'chair', phase: 'normal' })
const chairFounding = await h.prompts.assembleFor({ seat: 'chair', phase: 'founding' })
const memberNormal = await h.prompts.assembleFor({ seat: 'member', phase: 'normal' })
const tempNormal = await h.prompts.assembleFor({ seat: 'temp', phase: 'normal' })
const chairMeeting = await h.prompts.assembleFor({ seat: 'chair', phase: 'meeting', meeting: MID })

// Paper phases are pack-declared: the turn loop refuses `phase: 'paper-final'`, so the prompt pipeline that the
// kernel really uses is driven directly here (same sections, bindings and settings layer as harness assembly).
const { PACK } = await import(pathToFileURL(join(VMU, 'packs', 'v5r', 'prompts', 'v5r-core.js')).href)
const { collectPackSections } = await import(pathToFileURL(join(VMU, 'kernel', 'pack.js')).href)
const { createPromptPipeline } = await import(pathToFileURL(join(VMU, 'kernel', 'prompt', 'index.js')).href)
const { promptSettings } = await import(pathToFileURL(join(REPO, 'scripts', 'sim', 'settings.mjs')).href)
const pipeline = createPromptPipeline({ sections: collectPackSections([PACK]), bindings: PACK.bindings, clock: () => '2026-11-10T00:00:00.000Z' })
const paperCtx = { settings: promptSettings({ 'vmu.turn.objective': PROBLEM }), member: 'r-acad', role: 'chair', roleLabel: '院士', phase: 'paper-final', round: 3, roster: 'r-acad (院士), r-1 (常驻研究员)', quorum: 2 }
const paperFinal = String((await pipeline.assemble(paperCtx)).text || '')

// ── §0 the assemblies are real ────────────────────────────────────────────────────────────────────────────────
ok(chairNormal.length > 20000, '§0 chair-normal assembly is a full prompt', chairNormal.length)
ok(chairFounding.length > 20000, '§0 chair-founding assembly is a full prompt', chairFounding.length)
ok(paperFinal.length > 20000 && paperFinal.includes('paper_final'), '§0 paper-final assembly renders the final guide', paperFinal.length)

// ── §1 F75-03: the problem is NAMED, pinned, and echoed; the seat is told not to replace it ──────────────────
has(chairFounding, '不得自行替换或改写命题卡', '§1 founding: the hard rule "do not replace the problem" is in the prompt')
has(chairNormal, '不得自行替换或改写命题卡', '§1 normal: the hard rule survives every phase')
has(chairNormal, PROBLEM, '§1 normal: the problem passed to vibe_v5_start is echoed in the prompt (本所本期目标 / 总任务)')
has(chairNormal, '等所办裁决', '§1 the disagreement channel is note + the office ruling, not a rewrite')
has(chairNormal, 'vibe_v5_start', '§1 the rule names the tool that supplies the problem')

// ── §2 V2/V3 attribution vocabulary ─────────────────────────────────────────────────────────────────────────
has(chairNormal, 'memberWorkShare = memberActs/(memberActs+officeRelayedActs)', '§2 attribution: memberShare formula is taught')
has(chairNormal, 'memberActs', '§2 attribution: memberActs is named')
has(chairNormal, 'officeRelayedActs', '§2 attribution: officeRelayedActs is named')
has(chairNormal, 'unknownActs', '§2 attribution: unknownActs is named')
has(chairNormal, '不进分母', '§2 attribution: unknownActs does not enter the denominator')

// ── §3 proxy-writing receipt keys ───────────────────────────────────────────────────────────────────────────
// The ROW field is `writtenFrom` (TB-2691 naming ruling: `writerSource` already answers a different question on
// the library head, "which field answered by/writer/owner"), so the prompt must teach THAT name. Teaching the
// wrong name here was a real defect: the seat would look for a key the row does not carry.
for (const k of ['memberActed:false', 'actedForMember', 'ranInOwnTurn:false', 'writtenFrom']) {
  has(chairNormal, k, '§3 proxy keys: ' + k + ' is taught in the assembled prompt')
}
has(chairNormal, 'own-turn', '§3 the taught values are own-turn/relayed/unknown, not a bare key name')
ok(!/落盘行带 `writerSource`/.test(chairNormal), '§3 the prompt does not teach the retired field name for the row')

// ── §4 V4 status-board denominator: read the receipt, never count heads ─────────────────────────────────────
has(chairNormal, '`closureVote.votesCast`/`votesTotal`', '§4 board: votesCast and votesTotal are read from the receipt')
has(chairNormal, '分母=有表决权席', '§4 board: the denominator is the eligible seats, not whoever you can see')
has(chairNormal, '别自己数人头', '§4 board: the seat is told not to compute the fraction itself')

// ── §5 render never compiles (one sentence, in the paper teaching) ───────────────────────────────────────────
has(chairNormal, '永不编译', '§5 render: "render never compiles" is stated')
has(chairNormal, 'pdfBytes', '§5 render: pdfBytes is named as the compile/final product')
ok(chairNormal.includes('render') && chairNormal.includes('compile') && chairNormal.includes('final'), '§5 render: compile and final are both named as the writers')

// ── §6 VMU_NO_SUCH_OBJECT hint is not copyable: teach the reachable ids instead ─────────────────────────────
has(chairNormal, 'REACHABLE INSTEAD', '§6 no-such-object: the hint is labelled REACHABLE INSTEAD')
has(chairNormal, 'vibe_v5_overview {member:"<你的 id>"}', '§6 no-such-object: step 1 reads the roster for your own id')
has(chairNormal, 'vibe_v5_inbox {action:"list", member:"<roster id>"}', '§6 no-such-object: step 2 uses a roster id')
has(chairNormal, 'VMU_NO_SUCH_OBJECT', '§6 no-such-object: the code itself is still named')

// ── §7 V7 shape codes: all four, each with a fix, and shape != engine ───────────────────────────────────────
for (const code of ['VMU_TURN_BAD_JSON', 'VMU_TURN_UNKNOWN_FIELD', 'VMU_TURN_DELIVERY_SHAPE', 'VMU_TURN_DELIVERY_NO_PAYLOAD']) {
  has(chairNormal, code, '§7 shape codes: ' + code + ' is listed')
}
has(chairNormal, '不等于引擎不可用', '§7 shape codes: shape problems are not engine unavailability')
has(chairNormal, '不要去 probe 引擎', '§7 shape codes: the seat is told what NOT to do (probe the engine)')

// ── §8 V8 parked: the codes and the three-step order ───────────────────────────────────────────────────────
// WHY THIS IS NOT THE OLD ASSERTION ANY MORE (RUN 76 / TB-2710): the old text taught ONE code for TWO different
// refusals -- "re-dispatch the same seat while its turn is unanswered" was taught as VMU_TURN_PARKED_NEEDS_OWNER,
// while the kernel refuses that case with VMU_TURN_ALREADY_PARKED (refuseParkedOverwrite) and reserves
// PARKED_NEEDS_OWNER for "the reply names no parked prompt". So the prompt now names BOTH codes with their own
// trigger, and the three remedies are written as an arrow chain ("先答→abandon→再派") instead of the old prose.
// The claim being pinned is unchanged in substance: the seat is told the order answer -> abandon -> re-dispatch.
has(chairNormal, 'VMU_TURN_ALREADY_PARKED', '§8 parked: the RE-DISPATCH refusal is named with its own code')
has(chairNormal, 'VMU_TURN_PARKED_NEEDS_OWNER', '§8 parked: the OTHER code is named too (two situations, two codes)')
has(chairNormal, '先答→abandon→再派', '§8 parked: the three-step order is written as one chain')
has(chairNormal, '（先答）', '§8 parked: first remedy = answer that same seat first')
has(chairNormal, '再派', '§8 parked: third step = re-dispatch')

// ── §10 V12 closure numbers: two hard numbers, bytes on disk and pdfSha256 in the archive row ───────────────
has(paperFinal, 'pdfSha256', '§10 closure: pdfSha256 is named as the archive-row number')
has(paperFinal, '两个数', '§10 closure: the prompt says the check is TWO numbers')
has(paperFinal, 'bytes', '§10 closure: the disk byte count is named')

// ── §11 V5-V11 contradiction: office final is refused by the ROLE gate, single account ─────────────────────
has(paperFinal, '不代签', '§11 contradiction: "the office does not co-sign" is stated once')
has(paperFinal, 'VMU_NOT_PERMITTED', '§11 contradiction: the role gate code is named')
ok(!paperFinal.includes('会被具名拒（E4 的所办前置在本实现里未接线）'), '§11 contradiction: the old self-contradictory parenthetical is gone')

// ── §12 V4 draft section is never a blank block ────────────────────────────────────────────────────────────
const mergedBlock = paperFinal.split('------------ 合并稿（各成员部分）------------')[1] || ''
const firstLineAfterMerged = mergedBlock.split('\n').map((s) => s.trim()).filter((s) => s.length > 0)[0] || ''
ok(firstLineAfterMerged.length > 0 && !firstLineAfterMerged.startsWith('------------'), '§12 draft: the merged-parts block carries an explanation, not an empty body', firstLineAfterMerged.slice(0, 80))
ok(mergedBlock.includes('装配器注入'), '§12 draft: the explanation says WHO injects the block (assembly)')
const reviewBlock = paperFinal.split('------------ 互审结论 ------------')[1] || ''
const firstLineAfterReview = reviewBlock.split('\n').map((s) => s.trim()).filter((s) => s.length > 0)[0] || ''
ok(firstLineAfterReview.length > 0 && !firstLineAfterReview.startsWith('------------'), '§12 review: the review block carries an explanation, not an empty body', firstLineAfterReview.slice(0, 80))

// ── §13 the four seats all carry the new teaching (not just the chair) ─────────────────────────────────────
for (const [label, text] of [['member', memberNormal], ['temp', tempNormal]]) {
  has(text, '不等于引擎不可用', '§13 shape codes reach the ' + label + ' prompt')
}

// ── §14 item 9 REJECTED: the notice block is PREPENDED BY THE KERNEL, before any section; no prompt section can ─
//         move it. Pinned against the mechanism so this disposition cannot silently rot.
import { readFileSync } from 'node:fs'
const turnSrc = readFileSync(join(VMU, 'kernel', 'turn', 'index.js'), 'utf8')
ok(turnSrc.includes('(noticeText ? noticeText + "\\n" : "") + out.text'), '§14 item 9 is a KERNEL defect: the turn loop prepends the notice text to the assembled prompt', 'kernel/turn/index.js')

// ── §15 item 12 REJECTED: the corrections sections quote old AND new on purpose (tests/vmu-prompt-corrections) ─
const corrections = readFileSync(join(VMU, 'packs', 'v5r', 'prompts', 'v5r-corrections.js'), 'utf8')
ok(corrections.includes('json 代码围栏') && corrections.includes('VMU_TURN_REPLY_CONFLICT'), '§15 item 12: the correction names the obsolete wording and the current one on purpose (declared device, not stale text)')
ok((chairNormal.match(/【更正·/g) || []).length >= 3, '§15 item 12: the corrections render in the assembled chair prompt as 【更正·…】 sections')

// ── §17 F75-16 / TB-2707: the archive sentence is CONDITIONAL + CHECKABLE + NAMED FAILURE ──────────────────
// The old sentence said unconditionally 「全文落 `Members/<你>/Turns/<turn>.md`」, which reads as "the file is
// there" — RUN 75's r-temp never had a t-15 file, so a reader who followed it `cat`-ed a path that never
// existed. The fix must say WHEN the archive happens, HOW to know it really happened, and WHAT the receipt
// looks like when it did not. Three checks: the three phrases are present, the old unconditional sentence is
// gone (not coexisting), and the shared block renders the same sentence verbatim for all three seats.
const blocksBSource = readFileSync(join(VMU, 'packs', 'v5r', 'prompts', 'v5r-blocks-b.js'), 'utf8')
ok(
  blocksBSource.includes('仅当 `truncated:true`') &&
    blocksBSource.includes('写完立即回读并校验 sha256') &&
    blocksBSource.includes('archiveMissing:true'),
  '§17 F75-16 positive: the archive sentence names the condition (仅当 truncated:true), the checkable verb (写完立即回读并校验 sha256) and the named failure (archiveMissing:true)',
)
ok(
  !blocksBSource.includes('全文落 `Members/<你>/Turns/<turn>.md`'),
  '§17 F75-16 negative: the old unconditional sentence is gone (the fix is a replacement, not a coexistence)',
)
const archiveSentence = (text) => {
  const m = String(text).match(/\*\*仅当 `truncated:true`[\s\S]*?不要去找文件；/)
  return m ? m[0] : ''
}
const archiveChair = archiveSentence(chairNormal)
const archiveMember = archiveSentence(memberNormal)
const archiveTemp = archiveSentence(tempNormal)
ok(archiveChair.length > 0 && archiveChair === archiveMember && archiveMember === archiveTemp, '§17 F75-16 three seats: the shared block renders the same archive sentence verbatim in chair/member/temp', { chair: archiveChair.length, member: archiveMember.length, temp: archiveTemp.length })
ok(archiveChair.includes('truncated:false') && archiveChair.includes('不给这三个键'), '§17 F75-16 the sentence also states the negative case (truncated:false ⇒ no keys, do not look for the file)')

if (fails.length) {
  console.log('\n=== TB-2692 prompt criticisms: ' + passed + ' passed, ' + fails.length + ' failed ===')
  for (const f of fails) console.log('  - ' + f.label)
  process.exit(1)
}
console.log('=== TB-2692 prompt criticisms: ' + passed + ' passed, 0 failed ===')
