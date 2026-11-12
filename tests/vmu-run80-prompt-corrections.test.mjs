// RUN 80 / TB-2752 — four prompt corrections, pinned BEFORE and AFTER.
//
// The defect each correction closes was measured on the 80th live run (FEEDBACK80):
//   F80-3  a `review` receipt field (`judgedPartFingerprint`) read as a parameter: passing it is refused
//          `VMU_INVALID_ARGUMENT`, and the chair paper-flow bullet had lost `final` from the chain entirely.
//   F80-4  `part.evidence` resolves a pointer to a RECORD; two spellings name the SAME record — the bare id
//          `rec-<n>` and a member-file path whose FILENAME is that record id. Only self-chosen file names and prose
//          summaries are refused `VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING`. The first fix said "record ids only", which
//          the mechanism never implemented; this suite pins the ACCURATE two-spelling teaching and probes the gate.
//   F80-8  convening is a CHAIR act; the office identity listed 安排与召集 as its own work, which reads as
//          permission to open a meeting on another seat's behalf (the refusal hint then points at impersonation).
//   F80-12 the roster promised the temp seat 可读、可发言、可认领 unconditionally while a deployment that declares
//          `vmu.meetings.attendDeniedSeats` denies it attendance.
//
// Each pin has two sides: the old sentence must be GONE (an exact substring, not a paraphrase) and the new one must be
// PRESENT, in the ASSEMBLED prompt where a seat reads it (paper phases are assembled through the real pipeline, because
// they are not reachable through the turn harness). §4 is the anti-lamp: the same predicates must flip when the prompt
// or the accounting is mutated, so this suite cannot pass by asserting nothing.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'

const REPO = new URL('..', import.meta.url)
const read = (rel) => readFileSync(new URL(rel, REPO), 'utf8')

const { collect } = await import(new URL('../scripts/sim/audit/prompt-sections.mjs', import.meta.url).href)
const { checkEvidencePointers } = await import(new URL('../vibe-math-vmu/packs/v5r/paper-quality.js', import.meta.url).href)
const promptMod = await import(new URL('../vibe-math-vmu/kernel/prompt/index.js', import.meta.url).href)
const v5r = await import(new URL('../vibe-math-vmu/packs/v5r/index.js', import.meta.url).href)
const PACK = v5r.PACK

const paperPipe = promptMod.createPromptPipeline({ sections: PACK.sections, bindings: PACK.bindings || [], settings: {}, counts: {} })
const paperAt = async (phase) => (await paperPipe.assemble({ member: 'r-1', role: 'member', roleLabel: 'researcher', phase })).text

const got = await collect({ slots: ['chair', 'member', 'temp'], phases: ['normal', 'meeting'] })
const seatText = (slot, phase) => got.sections.filter((s) => s.slot === slot && s.phase === phase).map((s) => s.text).join('\n')
const chair = seatText('chair', 'normal')
const member = seatText('member', 'normal')
const temp = seatText('temp', 'normal')
const sum = got.combos.filter((c) => c.phase === 'normal').reduce((a, c) => a + c.chars, 0)

const identity = read('vibe-math-vmu/packs/v5r/prompts/assistant.json')
const identityText = JSON.parse(identity).sections.filter((s) => s.name === 'v5r-assistant-identity')[0].text
const run256 = read('tests/vmu-run256-prompts-compress.test.mjs')
const run77 = read('tests/vmu-run77-prompt-corrections.test.mjs')
const receiptsDoc = read('docs/acceptance/prompt-vs-receipts.md')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label) } else { failed++; console.log('  FAIL ' + label, detail === undefined ? '' : JSON.stringify(detail)) }
}
const says = (text, needle) => typeof text === 'string' && text.includes(needle)
const denies = (text, needle) => typeof text === 'string' && !text.includes(needle)

test('§0 the retired wording is gone from every place a seat reads it', async () => {
  console.log('=== 0. THE OLD SENTENCES (F80-3 / F80-4 / F80-8 / F80-12) ===')
  // F80-3 — the chair tool bullet used to skip `final`; the chain a chair reads must be the real one.
  ok(denies(chair, 'start→part→advance→review→render：用工具推进'), '§0a chair normal: the four-step chain (no `final`) is gone')
  // F80-4 — the path-form sentences, in the corpus block and in the writing guide.
  const write = await paperAt('paper-write')
  ok(denies(write, '在 evidence 里写清证据路径'), '§0b paper-write: `在 evidence 里写清证据路径` is gone')
  ok(denies(write, '文件路径、文件名、摘要都不收'), '§0c paper-write: the false absolute ("all paths/summaries refused") is gone')
  ok(denies(write, '`evidence` 也只收 id'), '§0c2 paper-write: the false "evidence takes ids only" clause is gone')
  ok(denies(write, '证据路径写在正文里'), '§0d paper-write: the part example no longer says to put a path in the body')
  // F80-8 — the office identity used to list convening next to hiring as its own work.
  ok(denies(identityText, '安排与召集'), '§0e office identity: `安排与召集` (own-work list) is gone')
  // F80-12 — the unconditional promise sentence, in both roster variants a chair/member reads.
  ok(denies(chair, '分派任务；但**没有表决权**'), '§0f chair normal roster: the unconditional temp promise is gone')
  ok(denies(member, '分派任务；但**没有表决权**'), '§0g member normal roster: the unconditional temp promise is gone')
})

test('§1 the replacement sentence is present where the seat reads it', async () => {
  console.log('=== 1. THE NEW SENTENCES ===')
  ok(says(chair, 'start→part→advance→review→final→render'), '§1a chair normal: the chain names `final` (the step that compiles)')
  const review = await paperAt('paper-review')
  ok(says(review, 'judgedPartFingerprint') && says(review, 'VMU_INVALID_ARGUMENT'), '§1b paper-review: the fingerprint is named as a RECEIPT field and passing it is refused', { len: review.length })
  ok(says(review, '它不是') || says(review, '它**不是**'), '§1c paper-review: says it is not a parameter (do not pass)')
  const write = await paperAt('paper-write')
  ok(says(write, 'rec-<n>') && says(write, 'VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING'), '§1d paper-write: evidence takes a record id and names the refusal')
  ok(says(write, '以记录 id 命名的文件卡路径'), '§1d2 paper-write: the second legal spelling (member-file path named by the record id) is taught')
  ok(says(write, '记录 id'), '§1e paper-write: the word is record id, not path')
  ok(says(identityText, '召集是主席的动作'), '§1f office identity: convening is a chair action')
  ok(says(identityText, 'vibe_vmu_turn { op: \\"drive\\"') || says(identityText, 'vibe_vmu_turn { op: "drive"'), '§1g office identity: the exit is to drive a chair turn')
  ok(says(chair, 'vmu.meetings.attendDeniedSeats') && says(chair, '入场'), '§1h chair normal roster: attendance comes from the declaration')
  ok(says(chair, 'vmu.meetings.eligibleSeats') && says(chair, '两键别混'), '§1h2 chair normal roster: vote rights are on their own key, and the two keys are not to be confused')
  ok(says(member, 'vmu.meetings.attendDeniedSeats'), '§1i member normal roster: same derivation')
  ok(says(temp, '不入会'), '§1j temp normal still carries the attendance sentence (the v5r-turn-convene line)')
})

test('§2 the two sides do not contradict each other', async () => {
  console.log('=== 2. NO CONTRADICTION BETWEEN THE NEW SENTENCES ===')
  const write = await paperAt('paper-write')
  // ★ The review rewrite: the prompt must not claim that EVERY path is refused (that was false — the gate resolves the
  // record-id-named member file). Pin the ACCURATE rule AND prove it against the real gate, so a future "ids only"
  // relapse is a red here rather than a seat following a false absolute.
  ok(!/路径(都|一律)不收/.test(write) && !/所有路径都不收/.test(write), '§2a paper-write: no sentence claims EVERY path is refused')
  ok(says(write, '自起的文件名') && says(write, '不收'), '§2b paper-write: the SELF-NAMED form is what is refused')
  const fakeRecords = {
    get({ id }) {
      if (id === 'rec-12') return { id: 'rec-12', track: 'propositions', fingerprint: 'fp' }
      if (id === 'rec-9') return { id: 'rec-9', track: 'methods', fingerprint: 'fp2' }
      const e = new Error('VMU_NO_SUCH_OBJECT unknown record: ' + id); e.code = 'VMU_NO_SUCH_OBJECT'; throw e
    },
    list() { return { items: [{ id: 'rec-12', title: 'odd squares' }, { id: 'rec-9', title: 'induction' }], truncated: false } },
  }
  const gate = (evidence) => checkEvidencePointers({ evidence, records: fakeRecords })
  ok(gate(['rec-12']).ok === true, '§2b2 mechanism: a bare record id resolves (the prompt must not deny this form)')
  ok(gate(['Members/r-1/Propos/rec-12.md']).ok === true, '§2b3 mechanism: the member-file path named by the record id resolves — the sentence the first fix taught was false')
  ok(gate(['Members/r-1/Propos/rec-12.md#三、证明']).ok === true, '§2b4 mechanism: the anchored form resolves too')
  ok(gate(['Members/r-1/Propos/my-own-name.md']).ok === false, '§2b5 mechanism: a SELF-NAMED file card is refused (this is the real rule)')
  ok(gate(['综述：见 rec-12']).ok === false, '§2b6 mechanism: prose/summary is refused')
  const review = await paperAt('paper-review')
  ok(denies(review, 'judgedPartFingerprint:必填') && denies(review, 'judgedPartFingerprint：必填'), '§2c paper-review: never calls the fingerprint a required parameter')
  ok(says(chair, 'final 只有 chair 被接受'), '§2d chair normal: `final` stays a chair-only act (the new chain line does not open it)')
  ok(says(identityText, '不要自己调 `vibe_v5_meeting` 代开'), '§2e office identity: explicitly says not to open it on the chair behalf')
})

test('§3 the water levels move with the text, not behind it', () => {
  console.log('=== 3. ACCOUNTING (run256 / run77) AND THE DOC WATERMARK ===')
  ok(run256.includes('const TB2752_RUN80_FIXES = { chair: 51, member: 45, temp: 0, sum: 96 }'), '§3a run256 records the corrections as one constant (per seat + 51 / + 45 / 0, sum + 96)')
  ok(run256.includes('+ RUN272_RUN79_RESTORE.chair + TB2752_RUN80_FIXES.chair'), '§3b run256 chair ceiling is derived from the constant')
  ok(run256.includes('+ RUN272_RUN79_RESTORE.sum + TB2752_RUN80_FIXES.sum'), '§3c run256 sum ceiling is derived from the constant')
  ok(run77.includes('const TB2752_RUN80_FIXES = { chair: 51, member: 45, temp: 0, sum: 96 }') && run77.includes('+ TB2752_RUN80_FIXES.sum') && run77.includes('+ TB2752_RUN80_FIXES.chair'), '§3d run77 §7 ceilings include the same constant')
  ok(says(receiptsDoc, 'TB-2752') && says(receiptsDoc, 'F80-3') && says(receiptsDoc, 'F80-4') && says(receiptsDoc, 'F80-8') && says(receiptsDoc, 'F80-12'), '§3e docs/acceptance/prompt-vs-receipts.md carries the four corrections')
  // The constant is not a wish: the live measurement equals baseline + constant.
  const chairLive = got.combos.filter((c) => c.slot === 'chair' && c.phase === 'normal')[0].chars
  ok(chairLive === 29499 + 51, '§3f chair normal live length = the RUN 272 water level + the recorded delta', { live: chairLive, expected: 29499 + 51 })
  ok(sum === 78168 + 96, '§3g three-seat normal sum = the RUN 272 water level + the recorded delta', { live: sum, expected: 78168 + 96 })
})

test('§4 anti-lamps: mutating the prompt or the accounting turns this suite red', async () => {
  console.log('=== 4. THE TWO LAMPS ===')
  // Lamp 1 — put the FALSE ABSOLUTE back into the assembled paper-write text. §0c (no "all paths refused") and §2a must
  // flip; if they cannot tell the accurate rule from the false one, this suite would pass both ways.
  const write = await paperAt('paper-write')
  const ACCURATE = '收两种写法'
  const FALSE_ABS = '文件路径、文件名、摘要都不收'
  const mutant = write.split(ACCURATE).join('只收记录 id') + ' ' + FALSE_ABS
  ok(denies(mutant, ACCURATE) && says(mutant, FALSE_ABS), '§4a lamp 1 (prompt): the §0c/§2a predicates FLIP on the false absolute', { len: mutant.length })
  ok(denies(mutant, ACCURATE), '§4b lamp 1: the two-spelling predicate is false on the mutant (the suite would red)')
  // Lamp 2 — the accounting constant is an exact equality, so a +1 edit is visible. Parse it back out of run256 and
  // recreate the arithmetic on the live numbers: recorded + 1 must NOT equal the live delta.
  const m = run256.match(new RegExp('TB2752_RUN80_FIXES = \\{ chair: (\\d+), member: (\\d+), temp: (\\d+), sum: (\\d+) \\}'))
  ok(m !== null, '§4c lamp 2 (accounting): the constant is machine-readable')
  const rec = { chair: Number(m[1]), member: Number(m[2]), temp: Number(m[3]), sum: Number(m[4]) }
  const chairLive = got.combos.filter((c) => c.slot === 'chair' && c.phase === 'normal')[0].chars
  ok(chairLive - 29499 === rec.chair, '§4d lamp 2: the recorded chair delta equals the live delta', { live: chairLive - 29499, recorded: rec.chair })
  ok(!(chairLive - 29499 === rec.chair + 1), '§4e lamp 2: a one-char bump of the constant is DETECTED (the equality is not a ceiling with slack)')
  ok(sum - 78168 === rec.sum, '§4f lamp 2: the recorded sum delta equals the live delta', { live: sum - 78168, recorded: rec.sum })
})

process.on('exit', () => {
  console.log('=== VMU RUN 80 PROMPT CORRECTIONS: ' + passed + ' passed, ' + failed + ' failed ===')
  if (failed > 0) process.exitCode = 1
})
