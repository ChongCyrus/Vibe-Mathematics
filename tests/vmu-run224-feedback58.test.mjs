/**
 * tests/vmu-run224-feedback58.test.mjs — RUN 224: four receipts that answered a neighbouring question.
 *
 * Measured on run 59 (FEEDBACK58), one per subsystem:
 *   A 1.1 `vibe_vmu_records { action:"prune", track:"blueprint", keep:1, dryRun:true }` warned that `rec-3` "declares
 *          status: current" and then forbade reading it as the row in force — while `vibe_v5_blueprint { action:"state" }`
 *          said `current.id` WAS rec-3. The declaration and the fact coincided, and the receipt called the fact history.
 *   B 1.7 `vibe_v5_blueprint { action:"adopt", draft:"rec-2" }` — the shape the prompts teach — was refused
 *          `VMU_INVALID_ARGUMENT`, by a refusal that itself printed the draft's path. The draft knows its own path.
 *   C 1.3 `$$ ... $$` was escaped into `\$$ ... $\$` (two literal dollars, a formula printed as text) while every count
 *          in the `math` block stayed 0, so the receipt said "nothing needed repair" about a formula that never typeset.
 *   D 1.2 a p=1 write-back said `p1Evidence:"debate-unanimous"` / `settled:true` while the same card carried
 *          `proofLockDeferred:pointer:missing`: nothing in that receipt named "this conclusion has no proof behind it".
 *   E 1.5 `sourcesMeans` said "There is NO key here named after chair-typed numbers" and then pointed at
 *          `sources.typed`, which is a key on the same tally.
 *
 * RULE E: every assertion is preceded by an explicit non-empty premise check.
 *
 * Run: node tests/vmu-run224-feedback58.test.mjs
 */
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = 'D:/wd/vibemath开发/Vibe-Mathematics'
const VMU = join(REPO, 'vibe-math-vmu')
const TMP = 'D:/_tmp/r224'
const SRC_TOOLS = readFileSync(join(VMU, 'packs', 'v5r', 'tools.js'), 'utf8')
const SRC_BLUEPRINT = readFileSync(join(VMU, 'packs', 'v5r', 'blueprint.js'), 'utf8')
const SRC_HOST = readFileSync(join(VMU, 'host.js'), 'utf8')
const SRC_PAPER = readFileSync(join(VMU, 'kit', 'paper.js'), 'utf8')

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) { passed += 1; console.log('  ok   ' + name) }
  else { failed += 1; failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}
const has = (text, needle, name) => ok(typeof text === 'string' && text.includes(needle), name, typeof text === 'string' ? text.slice(0, 240) : text)
const hasNot = (text, needle, name) => ok(typeof text === 'string' && !text.includes(needle), name, 'the forbidden sentence is still there')

mkdirSync(TMP, { recursive: true })
const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)

const boot = async () => {
  const specs = []
  const root = mkdtempSync(join(TMP, 'k-'))
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root })
  await handle.ready()
  await handle.kernel.store.open()
  const specOf = (n) => specs.filter((s) => s && s.name === n)[0] || null
  const call = async (name, args = {}) => {
    const spec = specOf(name)
    if (!spec) return { ok: false, code: 'VMU_TEST_NO_SUCH_TOOL', message: 'tool ' + name + ' was not registered', hint: null }
    try {
      const raw = await spec.execute(args, { kernel: handle.kernel })
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      return parsed && typeof parsed === 'object' ? parsed : { ok: false, code: 'VMU_TEST_NO_RECEIPT', message: String(raw), hint: null }
    } catch (e) {
      return { ok: false, code: (e && (e.code || (e.cause && e.cause.code))) || 'VMU_TEST_THROWN', message: String((e && e.message) || e), hint: (e && e.hint) || null }
    }
  }
  return { handle, call }
}

console.log('\n=== 0. THE FOUR FIXES ARE IN THE SOURCE, EACH UNDER ITS OWN NAME ===')

has(SRC_HOST, 'const headerFactsOf = (row) => {', '§0a the records face reads a row header ONCE, for status AND revision')
has(SRC_HOST, 'const inForceIds = declaredOfTrack.length === 0', '§0b the in-force revision is derived, not left null')
has(SRC_HOST, 'doomedInForceIds:', '§0c the receipt names WHICH doomed rows are in force')
hasNot(SRC_HOST, 'do NOT read these ids as "the rows in force".', '§0d the sentence that called a fact history is gone')
has(SRC_BLUEPRINT, 'let pathFrom = \'argument\'', '§0e adopt can take its path from the draft it names')
has(SRC_BLUEPRINT, 'pathFromMeans:', '§0f the receipt says where the path came from')
has(SRC_PAPER, 'displayMathSpans: 0', '§0g display math has its own counter')
has(SRC_PAPER, 'out += \'\\\\[\' + repairInMath', '§0h a `$$ … $$` pair is emitted as display math')
has(SRC_TOOLS, 'const p1ProofUnresolved = p1Form === null', '§0i a p=1 write-back computes whether the proof resolves')
has(SRC_TOOLS, 'p1ProofGate: p1ProofGateOut', '§0j the card gate is printed NEXT TO the p=1 fact')
hasNot(SRC_TOOLS, 'There is NO key here named after chair-typed numbers', '§0k sourcesMeans no longer denies the key it names')

console.log('\n=== 1. prune: the doomed row that IS the revision in force is named as such (run 59 exact shape) ===')

{
  const b = await boot()
  await b.call('vibe_v5_start', { problem: '前 n 个奇数之和等于 n 的平方', researcherCount: 2 })
  // legacy path: kernel-materialized only when materialize:true is explicit (RUN 255 default flipped to fs-first)
  const p1 = await b.call('vibe_v5_blueprint', { action: 'propose', materialize: true, path: 'Shared/Protocol.md', member: 'r-acad', text: '# 公共蓝图\n## 目标\n- 命题：前 n 个奇数之和 = n²。\n## 路线\n- 归纳法。' })
  ok(p1.ok === true, '§1a the chair proposed r1', p1)
  const p2 = await b.call('vibe_v5_blueprint', { action: 'propose', materialize: true, path: 'Shared/Protocol.md', member: 'r-1', text: '## 共同设计补充｜r-1\n- 复核归纳步。' })
  ok(p2.ok === true, '§1b a member added a co-design section', p2)
  const adopted = await b.call('vibe_v5_blueprint', { action: 'adopt', draft: p1.id, member: 'r-acad', path: 'Shared/Protocol.md' })
  ok(adopted.ok === true, '§1c the chair adopted r1', adopted)
  const state = await b.call('vibe_v5_blueprint', { action: 'state', path: 'Shared/Protocol.md' })
  ok(state.ok === true && state.current !== null && typeof state.current.id === 'string', '§1d the state names the revision in force', state.current)
  const currentId = String(state.current.id)
  const draft2 = await b.call('vibe_v5_blueprint', { action: 'propose', materialize: true, path: 'Shared/Protocol.md', member: 'r-2', text: '## 共同设计补充｜r-2\n- 第 2 版。' })
  ok(draft2.ok === true, '§1e a second revision is waiting as a draft', draft2)
  const preview = await b.call('vibe_vmu_records', { action: 'prune', track: 'blueprint', keep: 1, dryRun: true })
  ok(preview.ok === true, '§1f the dry run answered', preview)
  // run 59's shape: the draft is NEWEST (so keep:1 spares it) and the row that suffers is the CURRENT protocol.
  ok(Array.isArray(preview.doomedDeclaredCurrentIds) && preview.doomedDeclaredCurrentIds.includes(currentId), '§1g the doomed set contains the row that declares status: current', preview.doomedDeclaredCurrentIds)
  ok(Array.isArray(preview.inForceIds) && preview.inForceIds.includes(currentId), '§1h the derivation names the same row as the revision in force', preview.inForceIds)
  ok(preview.doomedInForceCount === 1, '§1i the count is FILLED (it used to be null)', preview.doomedInForceCount)
  ok(Array.isArray(preview.doomedInForceIds) && preview.doomedInForceIds.includes(currentId), '§1j the receipt names the doomed in-force row', preview.doomedInForceIds)
  ok(/in-force revision/i.test(String(preview.doomedInForceMeans)) && /highest `revision`/.test(String(preview.doomedInForceMeans)), '§1k the means states the ruler it used', preview.doomedInForceMeans)
  ok(/inForceIds/.test(String(preview.doomedDeclaredCurrentMeans)), '§1l the warning points AT the derivation instead of denying it', preview.doomedDeclaredCurrentMeans)
}

console.log('\n=== 2. adopt without a path: the draft is the source of the path (run 59 exact refusal) ===')

{
  const b = await boot()
  await b.call('vibe_v5_start', { problem: '前 n 个奇数之和等于 n 的平方', researcherCount: 2 })
  const p1 = await b.call('vibe_v5_blueprint', { action: 'propose', materialize: true, path: 'Shared/Protocol.md', member: 'r-acad', text: '# 公共蓝图\n## 目标\n- 命题：n²。\n## 路线\n- 归纳。' })
  ok(p1.ok === true, '§2a a draft exists', p1)
  await b.call('vibe_v5_blueprint', { action: 'propose', materialize: true, path: 'Shared/Protocol.md', member: 'r-1', text: '## 共同设计补充｜r-1\n- 复核。' })
  const adopted = await b.call('vibe_v5_blueprint', { action: 'adopt', draft: p1.id, member: 'r-acad' })
  ok(adopted.ok === true, '§2b adopt succeeds with NO path argument', adopted)
  ok(adopted.path === 'Shared/Protocol.md', '§2c the path came off the draft', adopted.path)
  ok(adopted.pathFrom === 'draft', '§2d the receipt says the path was read off the draft', adopted.pathFrom)
  ok(/READ OFF the draft/i.test(String(adopted.pathFromMeans)), '§2e and why that is not a guess', adopted.pathFromMeans)
  const wrong = await b.call('vibe_v5_blueprint', { action: 'adopt', draft: p1.id, member: 'r-acad', path: 'Blueprint/Other.md' })
  ok(wrong.ok === false, '§2f a path that contradicts the draft is still refused', wrong)
  ok(/is about path/.test(String(wrong.message)), '§2f2 the refusal still names both paths', wrong.message)
}

console.log('\n=== 3. `$$ … $$` is display math, and the receipt counts it ===')

{
  const b = await boot()
  await b.call('vibe_v5_start', { problem: '前 n 个奇数之和等于 n 的平方', researcherCount: 2 })
  const start = await b.call('vibe_v5_paper', { action: 'start', target: 'run224-paper', participants: ['r-1', 'r-2'], member: 'r-acad' })
  ok(start.ok === true, '§3a a paper is running', start)
  const part = await b.call('vibe_v5_paper', {
    action: 'part', target: 'run224-paper', member: 'r-1', part: '正文', evidence: [],
    body: '设 $S_k=k^2$。则\n$$S_{k+1}=S_k+\\bigl(2(k+1)-1\\bigr)=k^2+2k+1=(k+1)^2.$$\n证毕。',
  })
  ok(part.ok === true, '§3b the part was written', part)
  const rendered = await b.call('vibe_v5_paper', { action: 'render', target: 'run224-paper' })
  ok(rendered.ok === true, '§3c the paper rendered', rendered)
  const math = rendered.math || {}
  ok(math.displayMathSpans === 1, '§3d the display span was COUNTED', math)
  ok(math.inlineMathSpans >= 1, '§3e the inline span beside it was counted too', math)
  ok(/DISPLAY math/.test(String(math.displayMathMeans)), '§3f the block says a display formula printed on its own line', math.displayMathMeans)
  ok(math.unpairedDisplayMarkers === 0, '§3g no marker was left unpaired', math)
  const texRow = (await b.handle.kernel.records.list({ track: 'paper' })).items.filter((r) => /^v5r-paper\|.*\|tex$/.test(String(r.title || '')))[0]
  ok(texRow !== undefined, '§3h the .tex row exists in the ledger', texRow)
  const texBody = String((await b.handle.kernel.records.get({ id: texRow.id, includeBody: true })).body || '')
  ok(texBody.includes('\\[') && texBody.includes('\\]'), '§3i the formula was emitted as display math', texBody.slice(0, 400))
  ok(!texBody.includes('\\$$'), '§3j no escaped-dollars artefact', texBody.includes('\\$$'))
}

console.log('\n=== 4. a p=1 write-back prints the CARD proof gate and names the unresolved pointer ===')

{
  const b = await boot()
  await b.call('vibe_v5_start', { problem: '前 n 个奇数之和等于 n 的平方', researcherCount: 2 })
  const card = await b.call('vibe_v5_record_proposition', {
    p: 0.99, proof_ref: 'Members/r-1/Propos/nope-r224.md', proof_state: 'complete',
    statement: '前 n 个奇数之和等于 n²', value: true, motive: '归纳法',
  })
  ok(card.ok === true && typeof card.recordId === 'string', '§4a the card was filed', card)
  const settled = await b.call('vibe_v5_record_proposition', {
    id: card.recordId, p: 1,
    debate_ruling: { subject: card.recordId, value: 1, mode: 'unanimous', n: 3, decided: true, by: 'r-acad' },
  })
  ok(settled.ok === true, '§4b the p=1 settlement went through', settled)
  ok(settled.p1ProofUnresolved === true, '§4c the receipt names that the proof is NOT resolved', settled.p1ProofUnresolved)
  ok(settled.p1ProofGate !== null && settled.p1ProofGate !== undefined && settled.p1ProofGate.locked === false, '§4d the card own gate is beside the p=1 fact', settled.p1ProofGate)
  ok(/NOT resolved/.test(String(settled.p1ProofMeans)) && /does NOT mean a proof file/i.test(String(settled.p1ProofMeans)), '§4e the means separates "members agreed" from "proof verified"', settled.p1ProofMeans)
}

console.log('\n=== RESULT ===')
console.log('passed=' + passed + ' failed=' + failed)
if (failed) { console.log('failures:\n - ' + failures.join('\n - ')); process.exitCode = 1 }
