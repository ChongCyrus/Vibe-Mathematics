// PHASE 12 / B1 STEP 1 — the verified CARRIER (`packs/v5r/verified.js`), tested against the real records kernel.
// Spec source: docs/acceptance/phase12-v5r-rules-conformance.md row B1 (verbatim rule) +
// docs/acceptance/conformance/lane-verified-design.md (the carrier → gate → prompt order).
// What is asserted here is the CARRIER only: declarations, tolerant parsing that NAMES bad cards, the read views, and
// the single writer `promoteVerified` with its provenance contract. The GATE (who may mint a warrant, who may set p=1)
// is step 2 and is deliberately NOT asserted here — a test that pretended otherwise would be the vacuous kind.
// Run: node tests/vmu-verified-track.test.mjs     Last line: === VMU VERIFIED TRACK: N passed, M failed ===
import { createRecords } from '../vibe-math-vmu/kernel/records.js'
import {
  VERIFIED_TRACK, VERIFIED_KIND, CARD_TRACK, CARD_KIND, CARD_FIELDS, VERIFIED_REQUIRED_FIELDS, VERIFIED_OPTIONAL_FIELDS,
  VERIFIED_TITLE_PREFIX, FIELD_SEPARATOR, parseBody, parseCardBody, parseVerifiedBody, composeCardBody, composeVerifiedBody,
  sameFact, parseCard, parseVerified, listVerified, findVerified, promoteVerified,
} from '../vibe-math-vmu/packs/v5r/verified.js'

let passed = 0
let failed = 0
function ok(cond, label) { if (cond) { passed += 1 } else { failed += 1; console.log('FAIL ' + label) } }
function eq(actual, expected, label) {
  if (actual === expected) { passed += 1 } else { failed += 1; console.log('FAIL ' + label + ' (got ' + JSON.stringify(actual) + ' want ' + JSON.stringify(expected) + ')') }
}
function throwsNamed(fn, code, label, messageIncludes = '') {
  try { fn(); failed += 1; console.log('FAIL ' + label + ' (no refusal)'); return null } catch (e) {
    if (e && e.code === code && String(e.message).includes(messageIncludes)) { passed += 1; return e }
    failed += 1
    console.log('FAIL ' + label + ' (code=' + (e && e.code) + ' want ' + code + ', msg=' + (e && e.message) + ')')
    return e
  }
}
function fakeClock(start = 1000) { let t = start; return { now: () => t, advance: (ms) => { t += ms } } }

const TRACKS = [CARD_TRACK, VERIFIED_TRACK]
const KINDS = [CARD_KIND, VERIFIED_KIND]
function mk(extra = {}) {
  const clock = fakeClock()
  const settings = Object.assign({
    'vmu.records.tracks': TRACKS,
    'vmu.records.allowedKinds': KINDS,
    'vmu.records.requireSettledRecords': false,
  }, extra)
  const records = createRecords({ clock: clock.now, settings })
  return { records, clock, sget: (k) => settings[k] }
}
function card(records, { statement = '对任意 n，1+3+…+(2n-1)=n²', value = '简化围棋和式', motive = '为后续命题铺路', p = 0.5, title = '命题-平方和' } = {}) {
  const body = composeCardBody({ statement, value, motive, p })
  const rec = records.put({ track: CARD_TRACK, kind: CARD_KIND, title, body })
  return { id: rec.id, body }
}
const WARRANT = (subject) => ({ id: 'w-debate-1', kind: 'debate-unanimous', subject })

// ── ① declarations：the carrier IS a declaration, so its shape is the first thing to pin ──────────────────────
ok(Object.isFrozen(CARD_FIELDS) && CARD_FIELDS.length === 4, 'CARD_FIELDS is frozen and carries exactly the four declared card fields')
eq(CARD_FIELDS.join(','), 'statement,value,motive,p', 'the card fields are the ones kit/tools.js:21 declares (no proof field is invented)')
ok(Object.isFrozen(VERIFIED_REQUIRED_FIELDS) && VERIFIED_REQUIRED_FIELDS.includes('cardId') && VERIFIED_REQUIRED_FIELDS.includes('p')
  && VERIFIED_REQUIRED_FIELDS.includes('warrant') && VERIFIED_REQUIRED_FIELDS.includes('source') && VERIFIED_REQUIRED_FIELDS.includes('at'),
  'a verified row requires provenance (warrant/source) and a time — a conclusion with no judge is not representable')
ok(VERIFIED_OPTIONAL_FIELDS.includes('by') && VERIFIED_TRACK !== CARD_TRACK && VERIFIED_KIND !== CARD_KIND,
  'verified is its own track/kind (the carrier of the settled split), not a status value on the card track')
eq(FIELD_SEPARATOR, '：', 'the writer emits the full-width colon the v5r card face already writes (kit/handlers.js:76-89)')

// ── ② the card parser：round trip on a REAL records row, then every failure NAMED ─────────────────────────────
{
  const { records } = mk()
  const c = card(records, { p: 0.35 })
  const row = records.get({ id: c.id })
  const parsed = parseCard(row)
  ok(parsed.ok === true, 'parseCard accepts a card written through the declared writer', parsed.problems)
  eq(parsed.card && parsed.card.p, 0.35, 'the card probability round-trips as a NUMBER (0.35), not a string')
  eq(parsed.card && parsed.card.statement, '对任意 n，1+3+…+(2n-1)=n²', 'the statement round-trips verbatim')

  const noP = parseCardBody(composeCardBody({ statement: 's', value: 'v', motive: 'm' }))
  ok(noP.ok === false && noP.card === null, 'a card without p is REFUSED, not defaulted (card is null)')
  ok(noP.missing.includes('p') && noP.problems.join(';').includes('missing required field'), 'the missing field is NAMED in missing[]/problems')

  const colon = parseCardBody('- statement: s\n- value: v\n- motive: m\n- p: 0.7\n')
  ok(colon.ok === true && colon.card.p === 0.7, 'half-width separators parse too (an fs-written card is not rejected for its colon)')

  const dup = parseCardBody('- statement：s\n- value：v\n- motive：m\n- p：0.5\n- p：1\n')
  ok(dup.ok === false && dup.problems.join(';').includes('duplicate'), 'a duplicated header field is REPORTED (no silent last-wins)')

  const range = parseCardBody(composeCardBody({ statement: 's', value: 'v', motive: 'm', p: 1.5 }))
  ok(range.ok === false && range.problems.join(';').includes('outside [0,1]'), 'p outside [0,1] is refused with the value named')

  const garbage = parseCard({ id: 'r-x', track: CARD_TRACK, kind: CARD_KIND, body: 'no header lines at all' })
  ok(garbage.ok === false && garbage.problems.some((p) => p.includes('missing required field')), 'a body with no header lines fails with every missing field named')

  const headOnly = parseCard({ id: 'r-y', track: CARD_TRACK, kind: CARD_KIND })
  ok(headOnly.ok === false && headOnly.reason.includes('no body text'), 'a head-list row (no body) CANNOT be judged and says so')

  const wrongFace = parseCard({ id: 'r-z', track: 'progress', kind: 'progress', body: composeCardBody({ statement: 's', value: 'v', motive: 'm', p: 1 }) })
  ok(wrongFace.ok === false && wrongFace.reason.includes('not propositions/proposition'), 'a non-card record is named as the wrong face (only cards can be judged)')
}

// ── ③ the verified parser：only a CONCLUSION (1 or 0) is a verified row ───────────────────────────────────────
{
  const body = composeVerifiedBody({ cardId: 'r-1', p: 1, warrant: 'w-1', source: 'debate-unanimous', at: '2026-10-23T06:00:00.000Z', title: '命题-平方和', statement: '对任意 n，和式=n²', basis: 'warrant w-1 (debate-unanimous) subject r-1; conclusion 真 (p=1)' })
  const parsed = parseVerifiedBody(body)
  ok(parsed.ok === true, 'composeVerifiedBody → parseVerifiedBody round-trips', parsed.problems)
  eq(parsed.verified.p, 1, 'the verified probability round-trips')
  eq(parsed.verified.conclusion, true, 'p=1 reads as conclusion true')
  eq(parsed.verified.statement, '对任意 n，和式=n²', 'the `## 陈述` section is the trusted content, parsed separately from the header')
  const zero = parseVerifiedBody(composeVerifiedBody({ cardId: 'r-2', p: 0, warrant: 'w-2', source: 'debate-unanimous', at: '2026-10-23T06:00:00.000Z' }))
  ok(zero.ok === true && zero.verified.conclusion === false, 'p=0 reads as conclusion false (the track holds conclusions, either way)')
  const mid = parseVerifiedBody(composeVerifiedBody({ cardId: 'r-3', p: 0.5, warrant: 'w-3', source: 'debate-unanimous', at: '2026-10-23T06:00:00.000Z' }))
  ok(mid.ok === false && mid.problems.join(';').includes('only 1 or 0'), 'a p in (0,1) can NEVER be a verified row, and the refusal names it')
  const noWarrant = parseVerifiedBody(composeVerifiedBody({ cardId: 'r-4', p: 1, at: '2026-10-23T06:00:00.000Z' }))
  ok(noWarrant.ok === false && noWarrant.missing.includes('warrant') && noWarrant.missing.includes('source'),
    'a verified row without provenance is refused by field name (the carrier cannot hold an unattributed conclusion)')
  const wrongTrack = parseVerified({ id: 'r-5', track: CARD_TRACK, kind: CARD_KIND, body: 'x' })
  ok(wrongTrack.ok === false && wrongTrack.reason.includes('not verified'), 'a row on another track is refused as the wrong face')
}

// ── ④ the declared track is a PRECONDITION：an undeclared track is the kernel's named refusal ────────────────
{
  const { records } = mk({ 'vmu.records.tracks': [CARD_TRACK], 'vmu.records.allowedKinds': [CARD_KIND] })
  const err = throwsNamed(() => findVerified(records, 'r-1'), 'VMU_INVALID_ARGUMENT', 'findVerified on a deployment that did NOT declare the verified track is refused by name', 'unknown record track')
  ok(err && Array.isArray(err.enforced) && err.enforced.length > 0, 'that refusal carries the records enforced[] (the kernel raised it, not this pack)')
  eq(records.list({ track: CARD_TRACK }).count, 0, 'and the card track is untouched — the refusal is not a half-installed carrier')
}

// ── ⑤ promoteVerified：the SINGLE WRITER and its provenance contract ────────────────────────────────────────
{
  const { records } = mk()
  const c = card(records, { p: 0.7 })
  throwsNamed(() => promoteVerified({ records, sourceId: c.id, warrant: WARRANT(c.id) }), 'VMU_STATE',
    'a card at p=0.7 cannot enter the verified track (not settled)', 'not settled')
  eq(records.list({ track: VERIFIED_TRACK }).count, 0, 'the refused promotion wrote NOTHING (no half row)')

  throwsNamed(() => promoteVerified({ records, sourceId: c.id }), 'VMU_INVALID_ARGUMENT', 'a promotion without a warrant is refused', 'WARRANT')
  throwsNamed(() => promoteVerified({ records, sourceId: c.id, warrant: { id: 'w' } }), 'VMU_INVALID_ARGUMENT',
    'a warrant without a kind is refused (provenance must be addressable)')
  throwsNamed(() => promoteVerified({ records, sourceId: c.id, warrant: { id: 'w-9', kind: 'debate-unanimous', subject: 'r-other' } }),
    'VMU_INVALID_ARGUMENT', 'a warrant produced for ANOTHER subject cannot promote this card', 'not card')
  eq(records.list({ track: VERIFIED_TRACK }).count, 0, 'all four refusals left the verified track empty')

  const settled = records.supersede({ id: c.id, reason: 'debate settled at p=1', body: composeCardBody({ statement: '对任意 n，1+3+…+(2n-1)=n²', value: '简化围棋和式', motive: '为后续命题铺路', p: 1 }) })
  ok(settled.ok === true && settled.rev > 1, 'the card was settled by a supersede (the debate path in miniature, not a p edit)')
  const first = promoteVerified({ records, sourceId: c.id, warrant: WARRANT(c.id), at: 5000, by: 'chair' })
  ok(first.ok === true && first.written === true && first.conclusion === true, 'p=1 + warrant ⇒ the conclusion enters the verified track', first)
  eq(records.list({ track: VERIFIED_TRACK }).count, 1, 'exactly ONE verified row exists after the promotion')
  const listed = listVerified(records)
  eq(listed.count, 1, 'listVerified sees the row')
  eq(listed.badCount, 0, 'and no broken verified rows')
  ok(listed.items[0].title.startsWith(VERIFIED_TITLE_PREFIX) && listed.items[0].title.includes('命题-平方和'),
    'the verified row is marked with 已验证｜ and keeps the proposition title (readable in the head list)')
  eq(listed.items[0].conclusion, true, 'the head row reports the conclusion, not just the number')
  eq(listed.items[0].source, 'debate-unanimous', 'the head row reports WHICH warrant judged it (provenance is readable without expanding)')
  const found = findVerified(records, c.id)
  ok(found && found.verified.cardId === c.id && found.verified.warrant === 'w-debate-1', 'findVerified resolves the card id through the verified row (not by title/position)')
  ok(findVerified(records, 'r-nonexistent') === null, 'findVerified returns null for a card with no conclusion — it never guesses')

  const again = promoteVerified({ records, sourceId: c.id, warrant: WARRANT(c.id), at: 6000, by: 'chair' })
  ok(again.ok === true && again.written === false && again.unchanged === true, 'a second identical promotion is a NO-OP (written:false, unchanged:true)')
  eq(records.list({ track: VERIFIED_TRACK }).count, 1, 'and it did not inflate the track (idempotent writer)')

  const revised = records.supersede({ id: c.id, reason: 'statement clarified after the debate', body: composeCardBody({ statement: '对任意正整数 n，前 n 个奇数之和 = n²', value: '简化围棋和式', motive: '为后续命题铺路', p: 1 }) })
  ok(revised.ok === true, 'the settled card can still be clarified on the record')
  const refresh = promoteVerified({ records, sourceId: c.id, warrant: WARRANT(c.id), at: 7000 })
  ok(refresh.ok === true && refresh.written === true && refresh.refreshed === true, 'a changed statement REFRESHES the verified row (supersede), it does not add a second one', refresh)
  eq(records.list({ track: VERIFIED_TRACK }).count, 1, 'the track still holds exactly one row for this card')
  const refreshed = findVerified(records, c.id)
  ok(refreshed && refreshed.verified.statement.includes('前 n 个奇数之和'), 'the refreshed row carries the clarified statement (the reader sees the current truth)')
}

// ── ⑥ 1 AND 0 both live in the track, and a p=0 card is not treated as experience ───────────────────────────
{
  const { records } = mk()
  const cTrue = card(records, { title: '命题-真', p: 0.2 })
  const cFalse = card(records, { title: '命题-假', p: 0.9 })
  records.supersede({ id: cTrue.id, reason: 'settled true', body: composeCardBody({ statement: '真命题', value: 'v', motive: 'm', p: 1 }) })
  records.supersede({ id: cFalse.id, reason: 'settled false', body: composeCardBody({ statement: '假命题', value: 'v', motive: 'm', p: 0 }) })
  const a = promoteVerified({ records, sourceId: cTrue.id, warrant: WARRANT(cTrue.id), at: 100 })
  const b = promoteVerified({ records, sourceId: cFalse.id, warrant: { id: 'w-debate-2', kind: 'debate-unanimous', subject: cFalse.id }, at: 200 })
  ok(a.conclusion === true && b.conclusion === false, 'a refuted proposition enters the same track with conclusion:false (0 is a conclusion, not a failure)')
  eq(records.list({ track: VERIFIED_TRACK }).count, 2, 'both conclusions are listed')
  eq(listVerified(records).items.filter((it) => it.conclusion === false).length, 1, 'exactly one of them reads as a refutation')
}

// ── ⑦ a WITHDRAWN proof：the row cannot be re-promoted and the read point hides it ─────────────────────────
{
  const { records } = mk()
  const c = card(records, { p: 1 })
  promoteVerified({ records, sourceId: c.id, warrant: WARRANT(c.id), at: 100 })
  const withdrawn = { passedWithdrawnFor: (logicalId) => logicalId === c.id }
  ok(findVerified(records, c.id) !== null, 'before the marker the conclusion is visible')
  ok(findVerified(records, c.id, { fidelity: withdrawn }) === null, 'a fidelity-withdrawn proof is INVISIBLE to findVerified (the marker is not a line nobody reads)')
  throwsNamed(() => promoteVerified({ records, sourceId: c.id, warrant: WARRANT(c.id), at: 200, fidelity: withdrawn }), 'VMU_STATE',
    'a withdrawn proof cannot be re-promoted (a withdrawal must not be undone by the next settlement)', 'WITHDRAWN')
  eq(records.list({ track: VERIFIED_TRACK }).count, 1, 'the refusal did not rewrite the row either')
}

// ── ⑧ read views NAME broken rows instead of disappearing them ─────────────────────────────────────────────
{
  const { records } = mk()
  const c = card(records, { p: 1 })
  promoteVerified({ records, sourceId: c.id, warrant: WARRANT(c.id), at: 100 })
  const junk = records.put({ track: VERIFIED_TRACK, kind: VERIFIED_KIND, title: 'hand-written verified row', body: 'this row was written straight into the track' })
  const listed = listVerified(records)
  eq(listed.count, 1, 'the valid row is still counted')
  eq(listed.badCount, 1, 'the broken row is COUNTED as bad, not dropped from the view')
  ok(listed.bad[0].id === junk.id && listed.bad[0].reason.includes('missing required field'), 'the bad row is named with the reason (step 2 turns this into the single-writer gate)')
}

// ── ⑨ the body cap is reported, never silently eaten (v3 `bounded` parity) ─────────────────────────────────
{
  // The CAP UNDER TEST IS THE CARRIER'S (`capBytes`), not the records write cap: a card larger than
  // `vmu.records.bodyCapBytes` is already truncated BY THE RECORDS FACE on write, so it could never be promoted at all.
  const { records } = mk()
  const c = card(records, { p: 1 })
  const full = composeVerifiedBody({ cardId: c.id, p: 1, warrant: 'w-1', source: 'debate-unanimous', at: 't', statement: 's', basis: 'x'.repeat(300) })
  ok(Buffer.byteLength(full, 'utf8') > 120, 'precondition: the composed verified body really is over the 120-byte carrier cap')
  const out = promoteVerified({ records, sourceId: c.id, warrant: WARRANT(c.id), at: 100, capBytes: 120 })
  ok(out.bounded.truncated === true && out.bounded.dropped > 0, 'a verified body over the carrier cap reports bounded{dropped}', out.bounded)
  ok(out.bounded.cap === 120 && out.bounded.keptBytes <= 120, 'the receipt states the cap actually applied and the bytes kept')
  ok(parseVerifiedBody(composeVerifiedBody({ cardId: 'r-x', p: 1, warrant: 'w', source: 'debate-unanimous', at: 't' })).ok === true,
    'the composer still produces a parseable body (truncation is about size, not shape)')
  const row = records.get({ id: out.id })
  ok(row.bodyTruncated !== true && parseVerified(row).ok === true, 'the truncated row is still a PARSEABLE verified row (the header survived the cut)')
}

// ── ⑩ sameFact：only the volatile time line is ignored ───────────────────────────────────────────────────
{
  const base = { cardId: 'r-1', p: 1, warrant: 'w-1', source: 'debate-unanimous' }
  const a = composeVerifiedBody(Object.assign({}, base, { at: '2026-10-23T06:00:00.000Z' }))
  const b = composeVerifiedBody(Object.assign({}, base, { at: '2026-10-24T07:00:00.000Z' }))
  const c = composeVerifiedBody(Object.assign({}, base, { at: '2026-10-23T06:00:00.000Z', p: 0 }))
  ok(sameFact(a, b) === true, 'two bodies that differ only in `at` are the SAME fact (a re-settlement must not rewrite)')
  ok(sameFact(a, c) === false, 'a different conclusion is NOT the same fact')
  ok(sameFact(a, a) === true && sameFact('', '') === true, 'sameFact is reflexive and total (no throw on empty input)')
}

// ── ⑪ a truncated read is refused as unjudgeable, not half-parsed ─────────────────────────────────────────
{
  const { records } = mk({ 'vmu.records.bodyCapBytes': 60 })
  const c = card(records, { p: 1, statement: '长' .repeat(200) })
  const row = records.get({ id: c.id })
  ok(row.bodyTruncated === true, 'the records read really did truncate this card (precondition of the next assertion)')
  const parsed = parseCard(row)
  ok(parsed.ok === false && String(parsed.reason).includes('truncated'), 'a truncated read is refused with the truncation named — never judged by half its text')
}

// ── ⑫ every named export has a consumer in this file (red line ④: no mechanism without a consumer) ────────
{
  const surface = {
    VERIFIED_TRACK, VERIFIED_KIND, CARD_TRACK, CARD_KIND, CARD_FIELDS, VERIFIED_REQUIRED_FIELDS, VERIFIED_OPTIONAL_FIELDS,
    VERIFIED_TITLE_PREFIX, FIELD_SEPARATOR, parseBody, parseCardBody, parseVerifiedBody, composeCardBody, composeVerifiedBody,
    sameFact, parseCard, parseVerified, listVerified, findVerified, promoteVerified,
  }
  const unused = Object.keys(surface).filter((k) => surface[k] === undefined)
  eq(unused.length, 0, 'every export on the module surface is defined (' + Object.keys(surface).length + ' entries)')
  const split = parseBody('- a：1\n- b：2\n## 节\nbody\n')
  eq(split.fields.a, '1', 'parseBody is the shared splitter both parsers use (header + sections)')
  ok((split.sections['节'] || []).join('').includes('body'), 'and it keeps `## section` content for the verified body')
}

console.log('=== VMU VERIFIED TRACK: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)
