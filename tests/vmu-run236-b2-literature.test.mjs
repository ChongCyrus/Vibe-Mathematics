// tests/vmu-run236-b2-literature.test.mjs — B2 pinned on a REAL assembly (task-25 / RUN 236).
//
// THE RULE (宏观 v5r 规则 L7): Verified 只收 p=1 的命题，或【参考文献中的命题】—— a proposition taken from a
// cited reference may enter Verified directly, without the institute having debated it.
//
// THE AUDIT'S COMPLAINT (docs/acceptance/sim-audit-rules.md, B2 = PROSE-ONLY): the earlier probe attempted
// `vibe_v5_verified_promote` WITHOUT a warrant and got `VMU_INVALID_ARGUMENT`, so the audit could only see
// "the gate refuses" — the LITERATURE SUCCESS PATH was never observed and the rule looked prose-only.
//
// WHAT IS PINNED HERE (real kernel + real tool registry; each assertion guards non-emptiness first):
//   ① `vibe_v5_record_proposition {p:1, literature_ref}` accepts the LITERATURE route and SAYS SO
//      (`p1Route:"literature"`, `p1Evidence:"literature-reference"`, `verifiedMark.required:true,present:false`);
//   ② the CHAIR's `vibe_v5_verified_promote {warrant_kind:"literature", literature_ref}` WRITES the verified row
//      (a member's attempt is refused by name: the Verified ledger is the chair's institutional act)
//      (`written:true`), and the row is addressed to the same card (`cardId`/`sourceId` === the card) with
//      `conclusion:true` and the citation preserved as its warrant;
//   ③ the Verified library can READ that row back (the p=1 card is visible on the verified track), and the
//      proposition card now points at it (`verifiedRef`/`ready:true`, `readyOn` = the verified row id);
//   ④ the GATE still refuses a citation-less promotion (`warrant_kind:"literature"` with no `literature_ref`)
//      with a NAMED code and a hint that names the missing field — the success path above is a gate, not a hole.
//
// Run: node tests/vmu-run236-b2-literature.test.mjs

import { mkdirSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO } from './_lib/repo-root.mjs'

const TMP = 'D:/_tmp/vmu-run236'

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) {
    passed += 1
    console.log('  ok   ' + name)
  } else {
    failed += 1
    failures.push(name)
    console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 600)))
  }
}

const HARNESS = await import(pathToFileURL(join(REPO, 'scripts/sim/harness.mjs')).href)
mkdirSync(TMP, { recursive: true })
const root = mkdtempSync(join(TMP, 'b2-'))
const h = await HARNESS.boot({ root })
const as = (id) => ({ as: { agent: { id } } })

const CITE = 'Halmos, Measure Theory, §13 Theorem B (1950)'
const start = await h.call('vibe_v5_start', { problem: 'B2 真装配：参考文献入 Verified', researcherCount: 2 })
ok(start && start.ok === true, 'premise: the institute is founded on a real kernel', start && { ok: start.ok, hired: start.hired })

// ── ① the card takes the literature route and says so ─────────────────────────────────
const card = await h.call('vibe_v5_record_proposition', {
  member: 'r-1',
  statement: '单调收敛定理（取自参考文献）',
  value: '见 Halmos §13 Theorem B',
  motive: '经典结果，直接引用文献',
  p: 1,
  literature_ref: CITE,
}, as('r-1'))
ok(card && card.ok === true, 'a p=1 proposition WITH a literature reference is accepted',
  card && { ok: card.ok, code: card.code, message: card.message })
ok(card && typeof card.recordId === 'string' && card.recordId !== '', 'the proposition card has an id', card && card.recordId)
const cardId = card && card.recordId
ok(card && card.p1Route === 'literature', "the receipt names the route: p1Route === \"literature\"", card && card.p1Route)
ok(card && card.p1Evidence === 'literature-reference', 'the receipt names the evidence: p1Evidence === "literature-reference"', card && card.p1Evidence)
ok(card && card.verifiedMark && card.verifiedMark.required === true && card.verifiedMark.present === false,
  'the card is told the verified mark is REQUIRED and still absent (p=1 without it is invisible on the Verified track)',
  card && card.verifiedMark)

// ── ② the promotion writes the verified row ───────────────────────────────────────────
// The Verified track is the institute's ledger, so the ROLE that files a verified row is the chair (院士), not the
// member who wrote the card: `vibe_v5_verified_promote` is outside the member seat face by design. Pin BOTH halves —
// a member cannot promote (named refusal), and the chair CAN (the audited-unreachable success path).
const promoteByMember = await h.call('vibe_v5_verified_promote', {
  member: 'r-1', card: cardId, warrant_kind: 'literature', literature_ref: CITE,
}, as('r-1'))
ok(promoteByMember && promoteByMember.ok === false && promoteByMember.code === 'VMU_TOOL_NOT_IN_FACE',
  "a MEMBER cannot file a verified row (the promotion is the chair's institutional act, refused by name)",
  promoteByMember && { ok: promoteByMember.ok, code: promoteByMember.code, message: promoteByMember.message })
const promote = await h.call('vibe_v5_verified_promote', {
  member: 'r-acad', card: cardId, warrant_kind: 'literature', literature_ref: CITE,
}, as('r-acad'))
ok(promote && promote.ok === true, 'the literature promotion SUCCEEDS (the audited-unreachable path)',
  promote && { ok: promote.ok, code: promote.code, message: promote.message })
ok(promote && promote.written === true, 'the promotion WROTE the verified row (written:true)', promote && promote.written)
ok(promote && typeof promote.id === 'string' && promote.id !== '' && promote.id !== cardId, 'the verified row has its OWN id (distinct from the card id)',
  promote && { id: promote.id, cardId: promote.cardId })
ok(promote && promote.cardId === cardId && promote.sourceId === cardId, 'the verified row is addressed to the card (cardId/sourceId === the card id)',
  promote && { cardId: promote.cardId, sourceId: promote.sourceId, expected: cardId })
ok(promote && promote.conclusion === true && promote.p === 1, 'the row concludes TRUE at p=1', promote && { conclusion: promote.conclusion, p: promote.p })
ok(promote && promote.warrant && promote.warrant.kind === 'literature' && promote.warrant.id === CITE,
  'the citation itself is the warrant, preserved on the row', promote && promote.warrant)

// ── ③ the Verified library reads it back, and the card now points at it ────────────────
// The verified row is OWNED by the chair that filed it (attribution is a fact of the row, not a hidden link), so the
// library read is the institute's own view (office caller) rather than a member-filtered one.
const verified = await h.call('vibe_v5_read_library', { track: 'verified', list: true })
ok(verified && verified.ok === true && Array.isArray(verified.cards) && verified.cards.length > 0,
  'the Verified library is non-empty and readable', verified && { ok: verified.ok, total: verified.total })
const verifiedRows = (verified && Array.isArray(verified.cards)) ? verified.cards : []
const row = verifiedRows.filter((r) => r && r.id === (promote && promote.id))[0] || null
ok(Boolean(row), 'the promoted row appears on the Verified track', verifiedRows.map((r) => r && r.id))
ok(Boolean(row) && row.owner === 'r-acad',
  'the verified row is attributed to the CHAIR that filed it (the institutional act, not a hidden link)',
  row && { owner: row.owner, id: row.id })
ok(Boolean(row) && row.kind === 'verified' && row.track === 'verified', 'the row is really on the `verified` track', row && { kind: row.kind, track: row.track })

const props = await h.call('vibe_v5_read_library', { member: 'r-1', track: 'propositions', list: true }, as('r-1'))
const propsCards = (props && Array.isArray(props.cards)) ? props.cards : []
const cardRow = propsCards.filter((c) => c && c.id === cardId)[0] || null
ok(Boolean(cardRow), 'the proposition card is readable back', propsCards.map((c) => c && c.id))
ok(Boolean(cardRow) && cardRow.verifiedRef && cardRow.verifiedRef.id === (promote && promote.id),
  'the card now POINTS at the verified row (verifiedRef.id)', cardRow && cardRow.verifiedRef)
ok(Boolean(cardRow) && cardRow.ready === true && cardRow.readyOn === (promote && promote.id),
  'the card reads ready:true with readyOn = the verified row (the ledger, not the card, is the witness)',
  cardRow && { ready: cardRow.ready, readyOn: cardRow.readyOn })
ok(Boolean(cardRow) && cardRow.readyConclusion === true, "the ready reading names the conclusion (true)",
  cardRow && cardRow.readyConclusion)

// ── ④ the gate still refuses a citation-less promotion ────────────────────────────────
const card2 = await h.call('vibe_v5_record_proposition', {
  member: 'r-1', statement: '第二个文献命题（用于拒绝路径）', value: '见另一条文献', motive: '测试无引用拒绝', p: 1, literature_ref: '另一条文献 · §2',
}, as('r-1'))
ok(card2 && card2.ok === true && typeof card2.recordId === 'string', 'premise: a second cited card exists for the refusal path', card2 && { ok: card2.ok, recordId: card2.recordId })
const bare = await h.call('vibe_v5_verified_promote', { member: 'r-acad', card: card2 && card2.recordId, warrant_kind: 'literature' }, as('r-acad'))
ok(bare && bare.ok === false, 'a literature promotion WITHOUT a citation is REFUSED (not silently accepted)', bare && { ok: bare.ok, code: bare.code })
ok(bare && bare.code === 'VMU_INVALID_ARGUMENT', 'the refusal is the named code VMU_INVALID_ARGUMENT', bare && bare.code)
ok(bare && typeof bare.message === 'string' && bare.message.includes('literature') && bare.message.includes('citation'),
  'the refusal NAMES what is missing (a literature promotion needs the citation it comes from)', bare && bare.message)
ok(bare && typeof bare.hint === 'string' && bare.hint.includes('literature_ref'),
  'the hint names the field that would satisfy the gate (literature_ref)', bare && bare.hint)

console.log('\n=== vmu-run236 B2 literature: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('failures: ' + JSON.stringify(failures))
  process.exitCode = 1
}
