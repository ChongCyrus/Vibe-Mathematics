/**
 * tests/vmu-run217-feedback53.test.mjs — RUN 217：run 54（FEEDBACK53）量到的「回执为真、但回答的是另一个问题」。
 *
 * THE THREE DEFECTS THIS SUITE PINS (all MEASURED in run 54, task-sim54.txt):
 *   ① `vibe-math-vmu/kit/paper.js` — the compile receipt said `pdf.produced:true` (a true answer to "is the file there"),
 *      and xelatex's own log said `Missing character: There is no ≥ (U+2265) in font [lmroman10-regular]` four times and
 *      the same for `∎` once. The PDF therefore read "n  1" where the paper wrote "n ≥ 1": the receipt never answered
 *      "did the mathematics print". Unicode math glyphs are now re-spelled as LaTeX math, and the repair counts travel in
 *      a new `math` block on render / compile, whose `means` says when formulas will READ AS TEXT instead of as math.
 *   ② `vibe-math-vmu/packs/v5r/blueprint.js` — `bodyPrefixDroppedMeans` said "the draft it continued" even when the call
 *      continued NOTHING (no open draft: the previous one had been adopted). Run 54 read `bodyPrefixDropped:0` as "you
 *      did not paste it back" and suspected the strip. The sentence is now per-call, and `continuedBase` names which row
 *      the text was (not) joined to.
 *   ③ `vibe-math-vmu/packs/v5r/tools.js` — a first write of a card declared `proof_state:"complete"` with a pointer that
 *      does not resolve returned `ok:true` + `proofState:"complete"` + `proofLockDeferred:true`; every field true, and the
 *      receipt still read like "rule L14's lock is on". A `proofGate{locked, why, nextMove, means}` block now answers the
 *      question `ok` cannot.
 *
 * RULE E: every fixture assertion is preceded by an explicit non-empty check; refusals are normalised from BOTH shapes.
 *
 * Run: node tests/vmu-run217-feedback53.test.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = 'D:/wd/vibemath开发/Vibe-Mathematics'
const VMU = join(REPO, 'vibe-math-vmu')
const TMP = 'D:/_tmp/r217'
mkdirSync(TMP, { recursive: true })

const SRC_PAPER = readFileSync(join(VMU, 'kit', 'paper.js'), 'utf8')
const SRC_BLUEPRINT = readFileSync(join(VMU, 'packs', 'v5r', 'blueprint.js'), 'utf8')
const SRC_TOOLS = readFileSync(join(VMU, 'packs', 'v5r', 'tools.js'), 'utf8')
const SRC_PROMPTS = readFileSync(join(VMU, 'packs', 'v5r', 'prompts', 'v5r-paper-prompts.js'), 'utf8')

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}
const codeOf = (e) => (e && (e.code || (e.cause && e.cause.code))) || null

const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)

const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'] }, config))
  await handle.ready()
  const specOf = (n) => state.specs.filter((s) => s.name === n)[0] || null
  const call = async (name, args = {}) => {
    const spec = specOf(name)
    if (!spec) return { ok: false, code: 'VMU_TEST_NO_SUCH_TOOL', message: 'tool ' + name + ' was not registered', hint: 'the spec registry is empty for this name' }
    try {
      const raw = await spec.execute(args)
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      return parsed && typeof parsed === 'object' ? parsed : { ok: false, code: 'VMU_TEST_NO_RECEIPT', message: 'the face answered ' + String(raw), hint: null }
    } catch (e) {
      return { ok: false, code: codeOf(e) || 'VMU_TEST_THROWN', message: String((e && e.message) || e), hint: (e && e.hint) || null }
    }
  }
  return { handle, state, specOf, call }
}

console.log('=== 0. THE THREE SENTENCES ARE IN THE SOURCE, AND THE TEACHING IS IN THE PROMPT ===')

ok(SRC_PAPER.includes('TEX_MATH_GLYPH') && SRC_PAPER.includes("'≥': '\\\\geq'"),
  '★ ① unicode math glyphs are re-spelled as LaTeX math (the font has no ≥ / ∎: xelatex logged "Missing character")', SRC_PAPER.includes('TEX_MATH_GLYPH'))
ok(SRC_PAPER.includes("'∎': '\\\\blacksquare'"),
  '★ ① and ∎ becomes \\blacksquare rather than a dropped glyph', SRC_PAPER.includes('\\\\blacksquare'))
ok(SRC_PAPER.includes('function PaperTexBody(') && SRC_PAPER.includes('function PaperTex({ target } = {}) { return PaperTexBody({ target }).tex }'),
  '★ ① the .tex source and its repair counts come from the same pass (a second pass would let them disagree)', SRC_PAPER.includes('PaperTexBody'))
ok(SRC_PAPER.includes('READS AS TEXT in the PDF instead of as mathematics'),
  '★ ① and the receipt says what an escaped caret MEANS: the formula reads as text', SRC_PAPER.includes('READS AS TEXT'))
ok(SRC_PAPER.includes('REPAIRS') || SRC_PAPER.includes('this paper needed repair before LaTeX could print it'),
  '★ ① the math block distinguishes "nothing needed repair" from "N glyphs were repaired"', SRC_PAPER.includes('needed repair before LaTeX'))
ok(SRC_PROMPTS.includes('行内数学') && SRC_PROMPTS.includes('$'),
  '★ ① the writing prompt TEACHES the paired-$ convention (the run 54 members wrote bare `_{i=1}^{n}` and it printed as text)', SRC_PROMPTS.includes('行内数学'))

ok(SRC_BLUEPRINT.includes('const continuedBase = target === null'),
  '★ ② the blueprint write names which row the text joined (or that none was)', SRC_BLUEPRINT.includes('const continuedBase'))
ok(SRC_BLUEPRINT.includes('this call STARTED revision'),
  '★ ② and the 0-drop branch says "nothing was compared", not "the draft you continued"', SRC_BLUEPRINT.includes('this call STARTED revision'))
ok(!SRC_BLUEPRINT.includes("const bodyPrefixDroppedMeans = dup.matched === null\n    ? 'your text did not begin with the draft it continued"),
  '★ ② the old unconditional sentence is gone (a comment may still quote it)', SRC_BLUEPRINT.includes("const bodyPrefixDroppedMeans = dup.matched === null\n    ? 'your text did not begin"))

// ★ RUN 221 (run 57 / FEEDBACK56 1.1): the block is now COMPUTED (a settlement reads the card back), so the pin asks
// that the receipt still answers "is it locked" and that the settlement path labels its read-back — not for one literal.
ok(SRC_TOOLS.includes('proofGate: proofGateOut') && SRC_TOOLS.includes('const proofGateOut = settlementReadback !== null'),
  '★ ③ the card write answers "is it LOCKED", not only "was it filed"', SRC_TOOLS.includes('proofGate: proofGateOut'))
ok(SRC_TOOLS.includes('read proofGate.locked, not `ok`'),
  '★ ③ and it says which field answers that question', SRC_TOOLS.includes('read proofGate.locked'))
ok(SRC_TOOLS.includes('REGISTER A NEW CARD'),
  '★ ③ the one reachable next move is named (records mint a new row per write)', SRC_TOOLS.includes('REGISTER A NEW CARD'))

console.log('=== 1. ① A FORMULA GLYPH THE FONT LACKS IS REPAIRED, AND THE RECEIPT COUNTS IT (run 54: 4×≥ + 1×∎ dropped) ===')
const A = await boot({ root: mkdtempSync(join(TMP, 'k-')) })
const kernel = A.handle.kernel
ok(kernel !== null && typeof kernel.records === 'object', 'the kernel booted with a records face (a null kernel would make every assertion below vacuous)', kernel === null)
await A.call('vibe_v5_start', { researcherCount: 2 })
const paperStart = await A.call('vibe_v5_paper', { action: 'start', participants: ['r-1', 'r-2'], target: 'run217-paper' })
const startedBlock = paperStart.started || paperStart
ok(paperStart.ok !== false && String(startedBlock.target || '') !== '', 'the paper opens with a target (a nameless paper would make the render call ambiguous)', paperStart)
const PAPER = String(startedBlock.target || 'run217-paper')
const part = await A.call('vibe_v5_paper', { action: 'part', target: PAPER, member: 'r-1', part: '第一节',
  body: '对任意整数 n ≥ 1 有：$\\sum_{i=1}^{n}(2i-1)=n^2$。' + '\n' + '字面写法 x^2 在 $ 之外，会读成文本。' + '\n' + '证毕。∎', evidence: [] })
ok(part.ok !== false, 'the part is written (a refused part would leave nothing to render)', { ok: part.ok, code: part.code, message: String(part.message || '').slice(0, 160) })
const rendered = await A.call('vibe_v5_paper', { action: 'render', target: PAPER })
ok(rendered.ok !== false, 'the render runs on the real flow', { ok: rendered.ok, code: rendered.code, message: String(rendered.message || '').slice(0, 160) })
const math = rendered.math || null
ok(math !== null && typeof math === 'object', '★ ① the render receipt carries a `math` block (without it, "produced" is the only claim available)', rendered.math)
ok(math !== null && math.glyphsRepaired === 2, '★★ ① both unicode math glyphs (≥ and ∎) were re-spelled, and the count says so', math && math.glyphsRepaired)
ok(math !== null && math.inlineMathSpans === 1, '★ ① the paired-$ span was counted as real math', math && math.inlineMathSpans)
ok(math !== null && math.proseCarets === 1, '★★ ① the caret OUTSIDE a $ span is counted as escaped-to-text (that is the run-54 formula shape)', math && math.proseCarets)
ok(math !== null && typeof math.means === 'string' && math.means.includes('needed repair'),
  '★ ① and the means says this paper needed repair before LaTeX could print it', math && math.means)

const texRow = kernel.records.list({ track: 'paper' }).items.filter((r) => String(r.title || '').includes('|tex'))[0] || null
ok(texRow !== null, 'the .tex artefact is on the ledger (a missing row would make the next assertions vacuous)', texRow)
const texBody = texRow === null ? '' : String((kernel.records.get({ id: texRow.id }).body) || '')
ok(texBody.includes('$\\geq$'), '★★ ① the .tex carries $\\geq$ where the paper wrote ≥ (not the bare glyph the font drops)', texBody.slice(0, 0) || texBody.includes('\\geq'))
ok(texBody.includes('$\\blacksquare$'), '★★ ① and $\\blacksquare$ where it wrote ∎', texBody.includes('\\blacksquare'))
ok(texBody.includes('$\\sum_{i=1}^{n}(2i-1)=n^2$'), '★ ① the paired-$ formula travelled VERBATIM into the .tex (that is what makes it mathematics)', texBody.includes('\\sum_{i=1}^{n}(2i-1)=n^2'))
ok(texBody.includes('\\textasciicircum{}'), '★ ① and the prose caret was escaped to literal text (the compile stays alive)', texBody.includes('\\textasciicircum{}'))

console.log('=== 2. ② WHICH ROW DID THIS TEXT JOIN? (run 54 read 0 / "you did not paste it back") ===')
const B = await boot({ root: mkdtempSync(join(TMP, 'k-')) })
const kb = B.handle.kernel
for (const [id, slot] of [['r-acad', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) await kb.members.hire({ id, slot })
ok(kb.members.roster().length === 3, 'three real members are seated (RULE E)', kb.members.roster().length)
const BASE = 'RUN 217 诊断草案第一段。'
const p1 = await B.call('vibe_v5_blueprint', { action: 'propose', member: 'r-1', text: BASE })
ok(p1.ok === true && typeof p1.id === 'string', 'a first proposal is written', { ok: p1.ok, id: p1.id, code: p1.code })
ok(p1.continued === false && p1.continuedBase && p1.continuedBase.continued === false && p1.continuedBase.actual === null,
  '★★ ② a call that continues NOTHING says so: `continuedBase.actual` is null, not a draft id', p1.continuedBase)
ok(typeof p1.bodyPrefixDroppedMeans === 'string' && p1.bodyPrefixDroppedMeans.includes('nothing was compared'),
  '★★ ② and the 0-drop branch says "nothing was compared" instead of "the draft you continued"', p1.bodyPrefixDroppedMeans)
ok(typeof p1.continuedBase.means === 'string' && p1.continuedBase.means.includes('continued:false is a FACT'),
  '★ ② the block explains that continued:false is a fact about the call, not a failure', p1.continuedBase.means)

const p2 = await B.call('vibe_v5_blueprint', { action: 'propose', member: 'r-2', draft: p1.id, text: '1.1b 续写：复核归纳步。' })
ok(p2.ok === true && p2.continued === true, 'a continuation is written', { ok: p2.ok, continued: p2.continued, code: p2.code })
ok(p2.continuedBase && p2.continuedBase.continued === true && p2.continuedBase.actual === p1.id,
  '★★ ② a continuation names the row it joined (requested = actual here)', p2.continuedBase)

console.log('=== 3. ③ "FILED" IS NOT "LOCKED": THE CARD WRITE ANSWERS THE LOCK QUESTION ===')
const C = await boot({ root: mkdtempSync(join(TMP, 'k-')) })
const kc = C.handle.kernel
for (const [id, slot] of [['r-acad', 'chair'], ['r-1', 'member']]) await kc.members.hire({ id, slot })
ok(kc.members.roster().length === 2, 'two real members are seated (RULE E)', kc.members.roster().length)
const card = await C.call('vibe_v5_record_proposition', { id: 'p-r217', statement: 'RUN 217：锁与登记的分离', value: '对 n≥1 成立', motive: 'RUN 217 复验 proofGate', p: 0.9, member: 'r-1', proof_ref: 'Nope/missing-r217.md', proof_state: 'complete' })
ok(card.ok === true, 'the card is filed AS DECLARED (this receipt is the "ok:true" run 54 read as "locked")', { ok: card.ok, code: card.code, message: String(card.message || '').slice(0, 160) })
ok(card.proofState === 'complete' && card.proofLockDeferred === true,
  'the two run-54 fields are unchanged: declared complete, lock deferred', { proofState: card.proofState, proofLockDeferred: card.proofLockDeferred })
ok(card.proofGate && card.proofGate.locked === false,
  '★★ ③ and `proofGate.locked:false` states the fact `ok:true` never did', card.proofGate)
ok(card.proofGate && typeof card.proofGate.nextMove === 'string' && card.proofGate.nextMove.includes('REGISTER A NEW CARD'),
  '★★ ③ the one reachable move is named (this row cannot be re-pointed)', card.proofGate && card.proofGate.nextMove)
ok(card.proofGate && typeof card.proofGate.means === 'string' && card.proofGate.means.includes('read proofGate.locked'),
  '★ ③ and the block says which field answers "is this card locked"', card.proofGate && card.proofGate.means)
const plain = await C.call('vibe_v5_record_proposition', { id: 'p-r217b', statement: 'RUN 217：无证明声明的卡', value: '未定论', motive: '对照：没有 proof_state 就没有锁的问题', p: 0.5, member: 'r-1' })
// ★ RUN 251 (F71-3, MEASURED on the 71st real-machine run): the OLD pin read "no proof state ⇒ `proofGate:null`" and
// its intent was "do not make a false lock claim". `null` does answer "not locked", but it cannot be TOLD APART from
// "this face forgot to report the gate" — the run-71 reader saw `proofGate:null` on a default card and could not say
// whether the card was a draft or the receipt was silent. The SAME intent is now proved by an explicit block: not
// locked AND a named reason, which is strictly more than null said.
ok(plain.ok === true && plain.proofGate && typeof plain.proofGate === 'object',
  '★★ ③ RUN 251: a card that declares no proof state STILL reports its gate (null would leave "is this locked" unanswered)', { ok: plain.ok, proofGate: plain.proofGate })
ok(plain.proofGate.locked === false, '★★ ③ ...and the default card is NOT locked (no false claim)', plain.proofGate)
ok(plain.proofGate.reason === 'default-draft',
  '★★★ ③ ...and the reason NAMES why: the card declared no proof_state, so it is the default DRAFT', { reason: plain.proofGate.reason })
ok(plain.proofGate.proofRefState === 'absent',
  '★ ③ ...and proofRefState says there was no pointer to resolve', { proofRefState: plain.proofGate.proofRefState })
ok(plain.proofState === null,
  '★ ③ ...while proofState itself stays null: the gate names the default, it does not invent a declared state', { proofState: plain.proofState })

console.log('')
if (failed === 0) console.log('=== RUN 217 FEEDBACK53: ' + passed + ' passed, 0 failed ===')
else { console.log('=== RUN 217 FEEDBACK53: ' + passed + ' passed, ' + failed + ' FAILED ==='); for (const f of failures) console.log('  - ' + f) }
process.exit(failed === 0 ? 0 : 1)
