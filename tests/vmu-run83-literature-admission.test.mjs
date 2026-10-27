#!/usr/bin/env node
// vmu RUN 83 / B2 — A PROPOSITION FROM A REFERENCE MAY ENTER THE VERIFIED TRACK WITHOUT A DEBATE.
//
// THE RULE (宏观层面v5r运行规则.md L7–L8): 命题的来源可以是内部辩论产出、参考文献中的命题，也可直接入 Verified。
// Before this round the pack had THREE p=1 evidences (verified row / unanimous debate / Lean+conformance) and the
// verified track's only writer refused anything else, so a literature proposition could be recorded but never admitted
// — the prompt said so in as many words ("本内核没有这个入口").
//
// WHAT THIS SUITE PROVES
//   ① p=1 with NO citation is still refused by name (the door did not open for everybody);
//   ② p=1 with `literature_ref` is allowed and the receipt says WHICH form admitted it (`p1Evidence`);
//   ③ an EMPTY citation is not a citation (same refusal as ①);
//   ④ `vibe_v5_verified_promote{warrant_kind:"literature"}` without `literature_ref` is refused by name;
//   ⑤ with it, the verified row exists and its warrant IS the citation — so "why is this settled" answers with a
//     source instead of "someone decided";
//   ⑥ the member's own read face sees the row as ready (the read side joins the same track).
import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
let NOW = 1000
const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async (spec) => { state.specs.push(spec); return () => {} } } }
  const handle = entry.apply(ctx, Object.assign({ clock: () => NOW + (NOW += 1000), packs: ['v5r'] }, config))
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const callJSON = async (b, name, args = {}, ctx = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, ctx) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
}
const json = (r) => (r && r.parsed) || null

const root = await mkdtemp(join('D:/_tmp', 'vmu-run83-literature-'))
try {
  const b = await boot({ root })
  const kernel = b.handle.kernel
  await kernel.members.hire({ id: 'r-acad', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })

  const STMT = '有限群 G 自由作用在有限集 X 上时，|G| 整除 |X|。'
  const VALUE = '轨道整除定理（文献标准结论）。'
  const MOTIVE = '把它当文献命题引用，检验文献入口。'
  const CITE = 'Dummit & Foote, Abstract Algebra, 3rd ed., Section 4.1 Proposition 8'

  // ① p=1 with no evidence at all ⇒ named refusal, still.
  const noEvidence = json(await callJSON(b, 'vibe_v5_record_proposition', {
    statement: STMT, value: VALUE, motive: MOTIVE, p: 1, member: 'r-1' }))
  ok(noEvidence && noEvidence.ok === false, '① p=1 with no evidence is refused', noEvidence && noEvidence.code)
  ok(noEvidence && noEvidence.code === 'VMU_PACK_V5R_P1_NEEDS_DEBATE', '① refusal is VMU_PACK_V5R_P1_NEEDS_DEBATE', noEvidence && noEvidence.code)
  ok(noEvidence && typeof noEvidence.hint === 'string' && noEvidence.hint.includes('literature-reference'), '① the hint names the literature form', noEvidence && noEvidence.hint)

  // ③ empty citation is not a citation.
  const emptyCite = json(await callJSON(b, 'vibe_v5_record_proposition', {
    statement: STMT, value: VALUE, motive: MOTIVE, p: 1, literature_ref: '   ', member: 'r-1' }))
  ok(emptyCite && emptyCite.ok === false && emptyCite.code === 'VMU_PACK_V5R_P1_NEEDS_DEBATE', '③ blank citation is not a citation', emptyCite && emptyCite.code)

  // ② the literature write is admitted and the receipt names the form.
  const card = json(await callJSON(b, 'vibe_v5_record_proposition', {
    statement: STMT, value: VALUE, motive: MOTIVE, p: 1, literature_ref: CITE, member: 'r-1' }))
  ok(card && card.ok === true, '② a cited proposition at p=1 is written', card && card.code)
  const cardId = card && typeof card.recordId === 'string' ? card.recordId : null
  ok(typeof cardId === 'string' && cardId.length > 0, '② the receipt names the record id', card && card.recordId)
  ok(card && card.p1Evidence === 'literature-reference', '② the receipt says which evidence form admitted it', card && card.p1Evidence)

  // ④ warrant_kind literature without a citation ⇒ refused by name.
  const noCite = json(await callJSON(b, 'vibe_v5_verified_promote', {
    card: cardId, warrant_kind: 'literature', member: 'r-acad' }))
  ok(noCite && noCite.ok === false && noCite.code === 'VMU_INVALID_ARGUMENT', '④ literature promotion without a citation is refused', noCite && noCite.code)
  ok(noCite && typeof noCite.hint === 'string' && noCite.hint.includes('literature_ref'), '④ the hint names literature_ref', noCite && noCite.hint)

  // ⑤ with the citation the row is written and the warrant IS the citation.
  const promoted = json(await callJSON(b, 'vibe_v5_verified_promote', {
    card: cardId, warrant_kind: 'literature', literature_ref: CITE, member: 'r-acad' }))
  ok(promoted && promoted.ok === true, '⑤ the promotion succeeds', promoted && promoted.code)
  ok(promoted && promoted.written === true, '⑤ the row is written', promoted && promoted.written)
  ok(promoted && promoted.warrant && promoted.warrant.kind === 'literature', '⑤ the verified row warrant kind is literature', promoted && promoted.warrant)
  ok(promoted && promoted.warrant && promoted.warrant.id === CITE, '⑤ the warrant id is the citation itself', promoted && promoted.warrant)

  // ⑤b idempotent re-promotion is not a second row.
  const again = json(await callJSON(b, 'vibe_v5_verified_promote', {
    card: cardId, warrant_kind: 'literature', literature_ref: CITE, member: 'r-acad' }))
  ok(again && again.ok === true && again.written === false, '⑤b repeating the promotion writes nothing', again && { ok: again.ok, written: again.written })

  // ⑥ the member's read face sees readiness.
  const read = json(await callJSON(b, 'vibe_v5_read_library', { member: 'r-1', track: 'propositions' }, { kernel }))
  const cards = read && Array.isArray(read.cards) ? read.cards : []
  const mine = cards.find((r) => r && String(r.id) === String(cardId)) || null
  ok(mine !== null, '⑥ the member reads the card back', read && { returned: read.returned, readyCount: read.readyCount })
  ok(mine !== null && mine.ready === true, '⑥ the card reads ready:true', mine && { ready: mine.ready, readyOn: mine.readyOn })
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 10 })
}

console.log('\n=== RUN 83 LITERATURE ADMISSION: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { for (const f of failures) console.error('FAILED: ' + f); process.exit(1) }
