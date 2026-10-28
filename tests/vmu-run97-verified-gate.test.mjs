#!/usr/bin/env node
// vmu ROUND 97 / B1 (independent audit) — THE VERIFIED TRACK IS MINTABLE ONLY THROUGH THE GATE.
//
// THE RULE (宏观层面v5r运行规则.md L7–L8): 命题的来源可以是内部辩论产出、参考文献中的命题，也可直接入 Verified。
// 也就是说 Verified 收的是「被证明为真的东西」（p=1，或文献结论）。
//
// WHAT THE AUDIT MEASURED (after our gates had been reported green):
//   ① `promoteVerified` admitted a p=0 card, so the track held refutations while every reader asked it "what is proven";
//   ② `vibe_v5_verified_promote` never called the p=1 evidence gate: `warrant_kind:"debate-unanimous"` with NO debate
//      at all minted a verified row. That is a soundness hole, not a presentation defect.
//
// WHAT THIS SUITE PINS
//   ① p=0 is refused BY NAME until it carries the ruling that refuted it (`VMU_PACK_V5R_VERIFIED_NEEDS_JUDGE`),
//      and with that ruling the disproof is admitted (the track carries judged conclusions, both truth and falsity);
//   ② p=1 with no evidence is refused by the SAME gate a card write uses (`VMU_PACK_V5R_P1_NEEDS_DEBATE`);
//   ③ the claimed kind must match the evidence that passed (literature evidence + debate-unanimous kind ⇒ refused);
//   ④ a real literature promotion succeeds and the receipt says which form admitted it (`p1Evidence`);
//   ⑤ a real unanimous debate ruling admits a debate-kind promotion;
//   ⑥ docs/03 and the teaching carry the same sentence (so a reader is not told the old shape).
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
const verifiedRows = (kernel) => {
  try {
    const rows = kernel.records.list({ track: 'verified' })
    const list = rows && Array.isArray(rows.items) ? rows.items : (rows && Array.isArray(rows.rows) ? rows.rows : (Array.isArray(rows) ? rows : []))
    return list.length
  } catch { return -1 }
}

const root = await mkdtemp(join('D:/_tmp', 'vmu-run97-verified-gate-'))
try {
  const b = await boot({ root })
  const kernel = b.handle.kernel
  await kernel.members.hire({ id: 'r-acad', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })

  const STMT = '若 G 是有限群且 H≤G，则 |H| 整除 |G|。'
  const VALUE = '拉格朗日定理。'
  const MOTIVE = '第 97 轮：verified 轨只收被证明为真的结论。'
  const CITE = 'Dummit & Foote, Abstract Algebra, 3rd ed., Section 3.2 Theorem 7'

  // a p=0 card (a refutation) and a p=1 card (a literature conclusion)
  const refuted = json(await callJSON(b, 'vibe_v5_record_proposition', {
    statement: STMT, value: VALUE, motive: MOTIVE, p: 0, member: 'r-1' }))
  ok(refuted && refuted.ok === true, 'setup: a p=0 card can be written', refuted && refuted.code)
  const refutedId = refuted && typeof refuted.recordId === 'string' ? refuted.recordId : null

  const card = json(await callJSON(b, 'vibe_v5_record_proposition', {
    statement: STMT, value: VALUE, motive: MOTIVE, p: 1, literature_ref: CITE, member: 'r-1' }))
  ok(card && card.ok === true, 'setup: a cited p=1 card can be written', card && card.code)
  const cardId = card && typeof card.recordId === 'string' ? card.recordId : null

  const before = 0  // the verified track starts empty in this suite
  ok(verifiedRows(kernel) === before, 'setup: the verified track starts empty', { before })

  // ① p=0 cannot enter the verified track, and the refusal says where the fact belongs.
  const refutePromote = json(await callJSON(b, 'vibe_v5_verified_promote', {
    card: refutedId, warrant_kind: 'literature', literature_ref: CITE, member: 'r-acad' }))
  ok(refutePromote && refutePromote.ok === false, '① a disproof without its ruling is refused', refutePromote && refutePromote.code)
  ok(refutePromote && refutePromote.code === 'VMU_PACK_V5R_VERIFIED_NEEDS_JUDGE', '① the refusal is VMU_PACK_V5R_VERIFIED_NEEDS_JUDGE', refutePromote && refutePromote.code)
  ok(refutePromote && typeof refutePromote.hint === 'string' && refutePromote.hint.includes('debate_ruling'),
    '① the hint names the ruling argument', refutePromote && refutePromote.hint)
  ok(verifiedRows(kernel) === before, '① nothing entered the track', { before, after: verifiedRows(kernel) })
  const refutedAdmitted = json(await callJSON(b, 'vibe_v5_verified_promote', {
    card: refutedId, warrant_kind: 'debate-unanimous', warrant: 'ballot-97-false', member: 'r-acad',
    debate_ruling: { mode: 'unanimous', value: 0, ballotId: 'ballot-97-false', subject: refutedId } }))
  ok(refutedAdmitted && refutedAdmitted.ok === true, '① with the unanimous 0 ruling the disproof is admitted', refutedAdmitted && refutedAdmitted.code)
  ok(verifiedRows(kernel) === 1, '① exactly the judged disproof entered', { after: verifiedRows(kernel) })
  const baseline = verifiedRows(kernel)

  // ② a p=1 card promoted with a warrant but NO evidence is refused by the same gate a card write uses.
  const noEvidence = json(await callJSON(b, 'vibe_v5_verified_promote', {
    card: cardId, warrant_kind: 'debate-unanimous', warrant: 'ballot-97', member: 'r-acad' }))
  ok(noEvidence && noEvidence.ok === false, '② a warrant without evidence is refused', noEvidence && noEvidence.code)
  ok(noEvidence && noEvidence.code === 'VMU_PACK_V5R_P1_NEEDS_DEBATE',
    '② the refusal is the p=1 evidence gate (the bypass is closed)', noEvidence && noEvidence.code)
  ok(verifiedRows(kernel) === baseline, '② the caller-supplied warrant minted nothing', { baseline, after: verifiedRows(kernel) })

  // ③ the claimed kind must be the kind the evidence actually shows.
  const mismatch = json(await callJSON(b, 'vibe_v5_verified_promote', {
    card: cardId, warrant_kind: 'debate-unanimous', warrant: 'ballot-97', literature_ref: CITE, member: 'r-acad' }))
  ok(mismatch && mismatch.ok === false, '③ literature evidence cannot be promoted as a debate kind', mismatch && mismatch.code)
  ok(mismatch && mismatch.code === 'VMU_PACK_V5R_P1_NEEDS_DEBATE',
    '③ the mismatch is refused by name', mismatch && mismatch.code)

  // ④ a real literature promotion is admitted and the receipt names the form.
  const lit = json(await callJSON(b, 'vibe_v5_verified_promote', {
    card: cardId, warrant_kind: 'literature', literature_ref: CITE, member: 'r-acad' }))
  ok(lit && lit.ok === true, '④ the literature promotion succeeds', lit && lit.code)
  ok(lit && lit.p1Evidence === 'literature-reference', '④ the receipt names the admitting form', lit && lit.p1Evidence)
  ok(lit && lit.warrant && lit.warrant.id === CITE, '④ the warrant is the citation', lit && lit.warrant)
  ok(verifiedRows(kernel) === baseline + 1, '④ exactly one row entered the track', { baseline, after: verifiedRows(kernel) })

  // ⑤ a real unanimous debate ruling admits a debate-kind promotion for its own card.
  await kernel.members.hire({ id: 'r-2', slot: 'member' })
  const second = json(await callJSON(b, 'vibe_v5_record_proposition', {
    statement: '每个有限域的元素个数都是素数的幂。', value: '有限域结构。', motive: '第 97 轮：辩论裁决入轨。',
    p: 1, literature_ref: 'Lang, Algebra, Chapter V, Theorem 5.1', member: 'r-2' }))
  const secondId = second && typeof second.recordId === 'string' ? second.recordId : null
  const debate = json(await callJSON(b, 'vibe_v5_verified_promote', {
    card: secondId, warrant_kind: 'debate-unanimous', warrant: 'ballot-97', member: 'r-acad',
    debate_ruling: { mode: 'unanimous', value: 1, ballotId: 'ballot-97', subject: secondId } }))
  ok(debate && debate.ok === true, '⑤ a unanimous debate ruling admits the debate kind', debate && debate.code)
  ok(debate && debate.p1Evidence === 'debate-unanimous', '⑤ the receipt names the debate form', debate && debate.p1Evidence)

  // ⑥ the contract and the track's own code carry the same sentence.
  const fsread = await import('node:fs/promises')
  const doc = await fsread.readFile(join(REPO, 'vibe-math-vmu', 'docs', '03-interface-contract.md'), 'utf8')
  ok(doc.includes('VMU_PACK_V5R_VERIFIED_NEEDS_JUDGE'), '⑥ docs/03 names the disproof-judge refusal')
  ok(doc.includes('证伪）同样要带「一致为 0 的那次裁决」'), '⑥ docs/03 says a disproof needs its ruling')
  const verifiedSrc = await fsread.readFile(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'verified.js'), 'utf8')
  ok(verifiedSrc.includes('THE TRACK CARRIES *JUDGED* CONCLUSIONS'), '⑥ verified.js states the admission it really has')
  const toolsSrc = await fsread.readFile(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')
  const promoteBlock = toolsSrc.slice(toolsSrc.indexOf('function toolVerifiedPromote'), toolsSrc.indexOf('★ D15'))
  ok(promoteBlock.includes('p1Intent('), '⑥ the promotion path calls the same p=1 gate')
  ok(promoteBlock.includes('FORM_OF_KIND'), '⑥ the kind must match the evidence form')
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 10 })
}

console.log('\n=== RUN 97 VERIFIED GATE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { for (const f of failures) console.error('FAILED: ' + f); process.exit(1) }
