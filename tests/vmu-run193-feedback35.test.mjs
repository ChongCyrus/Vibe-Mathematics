// RUN 193 — run 36 / FEEDBACK35 1.1, 1.2 and 1.6: three places where a sentence about the mechanism was not the
// mechanism.
//
// 1.1  A `part` refused in the `reviewing` stage told the caller to use `final{decision:"revise"}` — a call THIS flow
//      refuses in that very state (the status face listed only review/advance). The run tried the refused door first and
//      only then found `advance`, which really does send the paper back to writing when a reviewer refused deliverable.
// 1.2  `subjectGate.proofBasis` told the truth when the gate had NOT been handed machine evidence
//      (`"declaration-only"`) and serialised as null in the one case where it had (`proofVia:"lean-passed"`).
// 1.6  The paper prompt asserted "本内核尚无 LaTeX 编译执行器" while that same deployment compiled a PDF with xelatex
//      (`pdf.produced:true`, 107427 bytes). A capability claim that says "unavailable" about a working tool makes callers
//      give up early or go change settings that were never the problem.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const PAPER = read('vibe-math-vmu/kit/paper.js')
const GATES = read('vibe-math-vmu/packs/v5r/verification-gates.js')
const PAPER_PROMPTS = read('vibe-math-vmu/packs/v5r/prompts/v5r-paper-prompts.js')

const ok = (cond, why) => assert.ok(cond, why)
const has = (hay, needle, why) => assert.ok(hay.includes(needle), why + ' (missing: ' + needle + ')')
const hasNot = (hay, needle, why) => assert.ok(!hay.includes(needle), why + ' (unexpected: ' + needle + ')')

test('§0 the three sentences name the mechanism (source pins)', () => {
  // 1.1 the hint is state-aware and names the move the state accepts
  has(PAPER, "state.status === 'awaiting-editor'", '§0a the part hint branches on the state')
  has(PAPER, 'the paper is in REVIEW: the move this state accepts is vibe_v5_paper { action: "advance"', '§0b and at reviewing it names `advance`')
  has(PAPER, 'a reviewer who did NOT answer deliverable sends the paper back to writing', '§0c and says what advance does there')
  has(PAPER, 'RUN 193', '§0d the change names the run it came from')
  // 1.2 the basis is stated on the branch that HAS evidence
  has(GATES, "proofBasis: verifiedHit ? 'verified-row' : 'lean-passed',", '§0e the evidenced branch states proofBasis')
  has(GATES, '与机器证据一致，所以这里不需要解释差异', '§0f and the note says what was checked')
  // 1.6 the prompt no longer claims the executor is absent
  hasNot(PAPER_PROMPTS, '本内核尚无此能力', '§0g the prompt no longer asserts no LaTeX executor exists')
  has(PAPER_PROMPTS, '以回执为准，不要预先假定不可用', '§0h and says the receipt decides')
  has(PAPER_PROMPTS, 'pdf.produced:true', '§0i and names the field that shows it worked')
})

test('§1 the rendered final-paper prompt states the capability conditionally', async () => {
  const { v5rPaperFinalSection } = await import(new URL('../vibe-math-vmu/packs/v5r/prompts/v5r-paper-prompts.js', import.meta.url))
  const text = String(v5rPaperFinalSection.text || '')
  ok(/pdfBytes/.test(text), '§1a the final prompt names pdfBytes as the measurement')
  ok(/xelatex|pdflatex|lualatex/.test(text), '§1b and the engine order it will try', { text: text.slice(0, 120) })
  ok(!/尚无/.test(text), '§1c it does not tell the reader the executor is missing')
})

test('§2 the state-aware hint is what a caller in each stage would be told', () => {
  // the two branches are quoted here so a re-wording that loses one of them fails loudly
  const awaitingStart = PAPER.indexOf("state.status === 'awaiting-editor'")
  const awaiting = PAPER.slice(awaitingStart, PAPER.indexOf(':', awaitingStart + 60) + 900)
  ok(/decision: "revise"/.test(awaiting), '§2a awaiting-editor keeps the editor door (final{revise})')
  const reviewIdx = PAPER.indexOf('the paper is in REVIEW: the move this state accepts')
  ok(reviewIdx > 0, '§2b the reviewing branch exists')
  const reviewing = PAPER.slice(reviewIdx, reviewIdx + 600)
  has(reviewing, 'action: "advance"', '§2c reviewing names advance')
  ok(!/final \{ decision: "revise" \} \}/.test(reviewing.slice(0, 120)), '§2d and does not lead with the refused door')
})
