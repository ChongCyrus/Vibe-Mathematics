/**
 * tests/vmu-b4-b5-blueprint.test.mjs — B5「共同设计」与 B4「按时更新」现在都是机制，不再是句子。
 *
 * THE TWO DEFECTS THIS SUITE PINS (rules ledger B4/B5, `docs/acceptance/rules-ledger.json`):
 *   B5 — rule: 「实现总目标的完整技术路线设计策划蓝图。按时更新、调整。由院士+常驻研究员共同设计策划、决定如何调整。
 *        最终编辑权交给院士。」 Before this round `proposeBlueprint` accepted a single author and `adoptBlueprint` only
 *        checked the CHAIR slot, so the 「共同」 half had no carrier anywhere: one seat drafted, the chair adopted, and
 *        the receipt looked exactly like a co-designed plan.
 *   B4 — rule: 「按时更新」. `BLUEPRINT_STALE_AFTER_MS` and one `stale` boolean existed, and nothing outside a `state`
 *        receipt ever read them: the reminder produced no consequence at all.
 *
 * THE MECHANISMS MEASURED HERE (all in `vibe-math-vmu/packs/v5r/blueprint.js`):
 *   ① ONE draft per unadopted revision. A second `propose` on the same path CONTINUES that draft (same record id, same
 *      revision) and appends the caller's own `## 共同设计补充｜<member>` section; every designer is recorded in the
 *      draft row's own `authors` header field (`[{seat,member,at}]`) — the row's persistent shape, no second store.
 *   ② `adopt` (still chair-only) refuses by name (`VMU_PACK_V5R_BLUEPRINT_NEEDS_CODESIGN`) unless `authors` show BOTH seats:
 *      the chair (院士席) AND at least one resident researcher (常驻研究员席). Empty `authors` (a draft written before
 *      this mechanism) is refused too, and the message SAYS it is historical data.
 *   ③ `blueprintFreshness(store, { now })` is the exported PURE reading (`stale/ageMs/staleAfterMs/means/…`) that turn
 *      assembly can call; the `state` receipt carries the SAME object as `freshness`, and when the revision in force is
 *      overdue the `state` read persists `lastStaleSeenAt` into that revision's own row (idempotent), so later reads see
 *      the history. `stale` is still NOT a refusal: `adopt` works, but it is reported as `overdueUpdate`.
 *
 * RULE E: every loop/fixture below is preceded by an explicit non-empty assertion; a refusal is normalised from BOTH
 * shapes (a thrown error and a serialised `{ok:false}` receipt) so it is never mistaken for a success.
 *
 * Run: node tests/vmu-b4-b5-blueprint.test.mjs
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = 'D:/wd/vibemath开发/Vibe-Mathematics'
const VMU = join(REPO, 'vibe-math-vmu')
const PATH = 'Shared/Protocol.md'
const PATH_ALT = 'Shared/Alt.md'
const PATH_SEAT = 'Shared/Seat.md'
const PATH_FRESH = 'Shared/Fresh.md'
const PATH_WRONG = 'Shared/Wrong.md'
const T0 = Date.parse('2020-01-01T00:00:00.000Z')

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}
const codeOf = (e) => (e && (e.code || (e.cause && e.cause.code))) || null
const textOf = (e) => String((e && (e.message || e.message === '' ? e.message : '')) || '')
const hintOf = (e) => (e && typeof e.hint === 'string' ? e.hint : null)

async function boot(config = {}) {
  const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)
  const specs = []
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const root = await mkdtemp(join('D:/_tmp', 'vmu-b45-'))
  const handle = entry.apply(ctx, Object.assign({ root, packs: ['v5r'], clock: () => 1000 }, config))
  await handle.ready()
  return { handle, specs, root, specOf: (name) => specs.filter((s) => s.name === name)[0] || null }
}

const BLUEPRINT = await import(pathToFileURL(join(VMU, 'packs', 'v5r', 'blueprint.js')).href)

const main = await boot({})
const kernel = main.handle.kernel
const spec = main.specOf('vibe_v5_blueprint')

/** Normalise BOTH refusal shapes (thrown error / serialised {ok:false} receipt) into one reading. */
const call = async (args) => {
  try {
    const raw = await spec.execute(args)
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (parsed && parsed.ok === false) {
      return { ok: false, parsed, code: parsed.code || null, message: String(parsed.message || ''), hint: parsed.hint || null }
    }
    return { ok: true, parsed }
  } catch (e) {
    return { ok: false, err: e, code: codeOf(e), message: textOf(e), hint: hintOf(e) }
  }
}
const triple = (r) => Boolean(r && typeof r.code === 'string' && /^VMU_/.test(r.code) && typeof r.message === 'string' && r.message.trim() !== '' && typeof r.hint === 'string' && r.hint.trim() !== '')

console.log('=== 0. THE SURFACES THIS SUITE DRIVES ARE PUBLISHED ===')
ok(kernel !== null && spec !== null, 'the pack applied and vibe_v5_blueprint is published (a null handle would make every assertion vacuous)', kernel === null)
const props = (spec && spec.parameters && spec.parameters.properties) || {}
ok(['action', 'path', 'member', 'text', 'draft'].every((k) => props[k] !== undefined),
  'the schema declares the verbs this suite drives (action/path/member/text/draft)', Object.keys(props))
ok(typeof BLUEPRINT.blueprintFreshness === 'function' && typeof BLUEPRINT.blueprintCodesignStatus === 'function' && typeof BLUEPRINT.proposeBlueprint === 'function',
  '★ the carrier exports the two NEW readings this round adds (blueprintFreshness / blueprintCodesignStatus) next to the writer', { freshness: typeof BLUEPRINT.blueprintFreshness, codesign: typeof BLUEPRINT.blueprintCodesignStatus })
ok(BLUEPRINT.BLUEPRINT_NEEDS_CODESIGN === 'VMU_PACK_V5R_BLUEPRINT_NEEDS_CODESIGN' && BLUEPRINT.BLUEPRINT_CODESIGN_SEAT === 'member' && BLUEPRINT.BLUEPRINT_ADOPT_SLOT === 'chair',
  'the codes are pack policy in one place (codesign code + the two seat names)', [BLUEPRINT.BLUEPRINT_NEEDS_CODESIGN, BLUEPRINT.BLUEPRINT_ADOPT_SLOT, BLUEPRINT.BLUEPRINT_CODESIGN_SEAT])
ok(BLUEPRINT.BLUEPRINT_FIELDS.indexOf('note') < BLUEPRINT.BLUEPRINT_FIELDS.indexOf('authors') && BLUEPRINT.BLUEPRINT_FIELDS.indexOf('authors') < BLUEPRINT.BLUEPRINT_FIELDS.indexOf('lastStaleSeenAt'),
  '★ B4/B5 fields are APPENDED to the row shape: the old fields keep their names and order, so every old row still parses', BLUEPRINT.BLUEPRINT_FIELDS)

await kernel.members.hire({ id: 'acad', slot: 'chair' })
await kernel.members.hire({ id: 'r-1', slot: 'member' })
await kernel.members.hire({ id: 'r-2', slot: 'member' })
const roster = kernel.members.roster()
ok(roster.length === 3, 'roster is non-empty before any identity assertion (RULE E)', roster.length)

console.log('=== 1. B5: ONE SEAT ALONE ⇒ adopt IS REFUSED BY NAME, AND NOTHING IS ADOPTED ===')
const draftA = await call({ action: 'propose', member: 'r-1', text: '第一版蓝图（研究员 r-1 起草）：\n1. 每轮先报进度。\n2. 命题必须可证伪。' })
ok(draftA.ok && draftA.parsed.continued === false && draftA.parsed.revision === 1, 'a single author can still PROPOSE (a draft is not in force)', draftA.parsed && { id: draftA.parsed.id, revision: draftA.parsed.revision, authors: draftA.parsed.authors })
ok(draftA.parsed && Array.isArray(draftA.parsed.authors) && draftA.parsed.authors.length === 1 && draftA.parsed.authors[0].member === 'r-1',
  '★ the draft row records its FIRST author in its own `authors` field (the persistent shape, not a second store)', draftA.parsed && draftA.parsed.authors)
const singleAdopt = await call({ action: 'adopt', member: 'acad', draft: draftA.parsed.id })
ok(singleAdopt.ok === false && singleAdopt.code === 'VMU_PACK_V5R_BLUEPRINT_NEEDS_CODESIGN',
  '★ B5 反：the chair adopting a SINGLE-AUTHOR draft is refused BY THE NEW CODE (not a silent success)', singleAdopt.code || singleAdopt.message)
ok(/院士/.test(singleAdopt.message), '★ the refusal NAMES the missing side (院士席) — the reader is told WHO must design, not just "no"', singleAdopt.message)
ok(/共同设计/.test(singleAdopt.message) && /adopt/.test(singleAdopt.message), 'the refusal quotes the rule it enforces and says adopt is the chair\'s final edit, not a substitute for co-design', singleAdopt.message.slice(0, 160))
ok(triple(singleAdopt), '★ the refusal is a three-piece: code + message + a copy-pasteable hint', { code: singleAdopt.code, hasMessage: singleAdopt.message.length > 0, hint: String(singleAdopt.hint || '').slice(0, 90) })
const stateAfterRefusal = await call({ action: 'state' })
ok(stateAfterRefusal.parsed && stateAfterRefusal.parsed.hasCurrent === false && stateAfterRefusal.parsed.draftsWaiting === 1,
  '★ the refused adoption changed nothing: no current revision, still one waiting draft', stateAfterRefusal.parsed && { hasCurrent: stateAfterRefusal.parsed.hasCurrent, drafts: stateAfterRefusal.parsed.draftsWaiting })

console.log('=== 2. B5: THE SECOND SEAT CONTINUES THE SAME DRAFT, AND THEN adopt PASSES ===')
const cont = await call({ action: 'propose', member: 'acad', path: PATH, text: '院士补充（共同设计）：\n3. 里程碑按周切分。\n4. 蓝图每月复查一次。' })
ok(cont.ok && cont.parsed.continued === true, '★ the chair\'s propose CONTINUES the open draft instead of minting a competing revision', cont.parsed && { id: cont.parsed.id, continued: cont.parsed.continued })
ok(cont.parsed.id === draftA.parsed.id && cont.parsed.revision === draftA.parsed.revision,
  '★ 同一 draft id、同一 revision: 共同设计落在同一份文档上（不是第二份草案）', { before: draftA.parsed.id, after: cont.parsed.id, revision: cont.parsed.revision })
ok(Array.isArray(cont.parsed.authors) && cont.parsed.authors.length === 2 && cont.parsed.authors.map((a) => a.member).sort().join(',') === 'acad,r-1',
  '★ authors now records BOTH seats\' members (r-1 + acad)', cont.parsed.authors)
const rowAfterCont = kernel.records.get({ id: cont.parsed.id })
const parsedCont = rowAfterCont ? BLUEPRINT.parseBlueprint(rowAfterCont) : null
ok(parsedCont && parsedCont.authors.length === 2, 'the two authors are a fact ON DISK (parsed back from the record row, not the receipt)', parsedCont && parsedCont.authors)
ok(parsedCont && parsedCont.text.includes('命题必须可证伪') && parsedCont.text.includes('## 共同设计补充｜acad') && parsedCont.text.includes('里程碑按周切分'),
  '★ the text holds the first author\'s prose VERBATIM plus the second author\'s attributed section (the first text was not rewritten)', parsedCont && parsedCont.text.slice(0, 120))
const codesign2 = BLUEPRINT.blueprintCodesignStatus(parsedCont.authors, 'acad')
ok(codesign2.ok === true && codesign2.hasChair === true && codesign2.hasResident === true && codesign2.missing.length === 0,
  '★ blueprintCodesignStatus measures 「共同」: 院士 side (adopter) + 常驻研究员 side (r-1) both present', codesign2)

const adopted = await call({ action: 'adopt', member: 'acad', draft: cont.parsed.id })
ok(adopted.ok && adopted.parsed.status === 'current', '★ B5 正：after BOTH seats designed the same draft, the chair adopts it', adopted.parsed ? { id: adopted.parsed.id, status: adopted.parsed.status } : (adopted.code || adopted.message))
ok(adopted.parsed && Array.isArray(adopted.parsed.authors) && adopted.parsed.authors.length === 2,
  '★ the adopted row carries the co-design record with it (who designed this version is a fact of the version)', adopted.parsed && adopted.parsed.authors)
ok(adopted.parsed && adopted.parsed.codesign && adopted.parsed.codesign.ok === true, 'the adopt receipt prints the codesign reading it just checked (no guessing after the fact)', adopted.parsed && adopted.parsed.codesign)
ok(adopted.parsed && adopted.parsed.overdueUpdate === false && adopted.parsed.previousRevision === 0,
  'the first adoption is not a late update (previousRevision 0, overdueUpdate false)', adopted.parsed && { previous: adopted.parsed.previousRevision, overdue: adopted.parsed.overdueUpdate })
const stateCo = await call({ action: 'state', path: PATH })
ok(stateCo.parsed && stateCo.parsed.hasCurrent === true && stateCo.parsed.current.authors.length === 2,
  '★ the read-out reports the current revision WITH both authors (the version in force names its designers)', stateCo.parsed && stateCo.parsed.current && stateCo.parsed.current.authors)
ok(stateCo.parsed && stateCo.parsed.freshness && typeof stateCo.parsed.freshness.means === 'string' && stateCo.parsed.freshness.means.length > 0,
  '★ B4: the state receipt carries the `freshness` reading (same shape as the exported function) with a non-empty means', stateCo.parsed && stateCo.parsed.freshness && { stale: stateCo.parsed.freshness.stale, keys: Object.keys(stateCo.parsed.freshness).slice(0, 8), means: String(stateCo.parsed.freshness.means).slice(0, 80) })

console.log('=== 3. B5: THE OTHER MISSING SIDE, THE UNCHANGED CHAIR-ONLY RIGHT, AND EXPLICIT SEATS ===')
const draftAlt = await call({ action: 'propose', member: 'acad', path: PATH_ALT, text: '院士单独起草的一版（缺研究员）。' })
ok(draftAlt.ok && draftAlt.parsed.authors.length === 1 && draftAlt.parsed.authors[0].member === 'acad',
  'a chair-only draft is allowed to exist (proposing is not adopting)', draftAlt.parsed && draftAlt.parsed.authors)
const memberAdopt = await call({ action: 'adopt', member: 'r-1', path: PATH_ALT, draft: draftAlt.parsed.id })
ok(memberAdopt.ok === false && memberAdopt.code === 'VMU_NOT_PERMITTED',
  '★ the chair-only FINAL EDIT RIGHT is unchanged: a member adopting is still refused by name (VMU_NOT_PERMITTED)', memberAdopt.code)
ok(triple(memberAdopt) && /chair|院士/i.test(memberAdopt.message), 'the member-adopt refusal is a three-piece and names the chair seat', { code: memberAdopt.code, hint: String(memberAdopt.hint || '').slice(0, 80) })
const residentMissing = await call({ action: 'adopt', member: 'acad', path: PATH_ALT, draft: draftAlt.parsed.id })
ok(residentMissing.ok === false && residentMissing.code === 'VMU_PACK_V5R_BLUEPRINT_NEEDS_CODESIGN' && /常驻研究员/.test(residentMissing.message),
  '★ the OTHER missing side is named too: 常驻研究员席（member）(a chair designing alone is not 「共同」)', { code: residentMissing.code, message: residentMissing.message })
ok(triple(residentMissing), 'this refusal is also a three-piece (code + message + hint)', { code: residentMissing.code, hint: String(residentMissing.hint || '').slice(0, 80) })
const residentJoins = await call({ action: 'propose', member: 'r-2', path: PATH_ALT, text: '研究员 r-2 的设计 section：先把判据写成可复算的步骤。' })
ok(residentJoins.ok && residentJoins.parsed.continued === true && residentJoins.parsed.id === draftAlt.parsed.id && residentJoins.parsed.authors.length === 2,
  '★ the hint\'s next step works: 研究员 propose on the same path continues the SAME draft and completes the co-design', residentJoins.parsed && { id: residentJoins.parsed.id, authors: residentJoins.parsed.authors })
const adoptedAlt = await call({ action: 'adopt', member: 'acad', path: PATH_ALT, draft: residentJoins.parsed.id })
ok(adoptedAlt.ok && adoptedAlt.parsed.status === 'current' && adoptedAlt.parsed.authors.map((a) => a.member).sort().join(',') === 'acad,r-2',
  '★ after the resident joined, the same chair adopts it (the refusal was a gate, not a dead end)', adoptedAlt.parsed && adoptedAlt.parsed.authors)

const seatMember = BLUEPRINT.proposeBlueprint({ records: kernel.records, path: PATH_SEAT, text: '研究员 r-1 的基准稿（显式 seat）。', by: 'r-1', seat: 'member', at: T0 })
ok(seatMember.ok && seatMember.authors.length === 1 && seatMember.authors[0].seat === 'member',
  'the writer RECORDS an explicit seat when the caller knows it (seat:"member")', seatMember.authors)
const seatChair = BLUEPRINT.proposeBlueprint({ records: kernel.records, path: PATH_SEAT, draft: seatMember.id, text: '院士用显式 seat 续写：加一条复查节奏。', by: 'acad', seat: 'chair', at: T0 + 1000 })
ok(seatChair.ok && seatChair.continued === true && seatChair.authors.map((a) => a.seat).sort().join(',') === 'chair,member',
  '★ explicit seats survive on the same draft row (chair + member)', seatChair.authors)
const seatAdopt = BLUEPRINT.adoptBlueprint({ records: kernel.records, path: PATH_SEAT, draft: seatMember.id, by: 'acad', at: T0 + 2000 })
ok(seatAdopt.ok && seatAdopt.codesign.missing.length === 0 && seatAdopt.authors.length === 2,
  '★ the module-level path (explicit seat + explicit draft) satisfies the same gate (no tool dependency)', seatAdopt.codesign)

console.log('=== 4. B4: blueprintFreshness IS PURE, INJECTABLE, AND ITS means SAYS WHAT OVERDUE MEANS ===')
const freshDraft = BLUEPRINT.proposeBlueprint({ records: kernel.records, path: PATH_FRESH, text: '新鲜度测试稿：基准。', by: 'r-1', seat: 'member', at: T0 })
const freshCont = BLUEPRINT.proposeBlueprint({ records: kernel.records, path: PATH_FRESH, draft: freshDraft.id, text: '共同设计补一条维护节奏。', by: 'acad', seat: 'chair', at: T0 + 1000 })
const freshAdopt = BLUEPRINT.adoptBlueprint({ records: kernel.records, path: PATH_FRESH, draft: freshDraft.id, by: 'acad', at: T0 + 2000 })
ok(freshAdopt.ok && freshAdopt.status === 'current', 'fixture: a co-designed revision was adopted at an INJECTED time (RULE E: the fixture is real)', freshAdopt.ok ? freshAdopt.adoptedAt : freshAdopt.message)
const freshReading = BLUEPRINT.blueprintFreshness({ records: kernel.records, path: PATH_FRESH }, { now: T0 + 3000 })
ok(freshReading.available === true && freshReading.stale === false && freshReading.hasCurrent === true,
  '★ fresh state under an injected now: stale=false, available=true', { stale: freshReading.stale, available: freshReading.available, ageMs: freshReading.ageMs })
ok(['stale', 'ageMs', 'staleAfterMs', 'means'].every((k) => Object.prototype.hasOwnProperty.call(freshReading, k)),
  '★ the reading has the four fields the caller needs (stale/ageMs/staleAfterMs/means)', Object.keys(freshReading))
ok(freshReading.ageMs === 1000 && freshReading.staleAfterMs === BLUEPRINT.BLUEPRINT_STALE_AFTER_MS,
  'the age is measured against the injectable clock and the threshold is PRINTED (not hidden policy)', { ageMs: freshReading.ageMs, staleAfterMs: freshReading.staleAfterMs })
ok(typeof freshReading.means === 'string' && freshReading.means.length > 0 && /未逾期/.test(freshReading.means),
  '★ means is NON-EMPTY for the fresh state: "not overdue" is explained, not left as a bare false', String(freshReading.means).slice(0, 90))
ok(freshReading.lastStaleSeenAt === null && freshReading.persist.written === false,
  '★ the pure reader wrote NOTHING (lastStaleSeenAt null, persist.written false)', { lastStaleSeenAt: freshReading.lastStaleSeenAt, persist: freshReading.persist })

const staleNow = T0 + BLUEPRINT.BLUEPRINT_STALE_AFTER_MS + 5000
const staleReading = BLUEPRINT.blueprintFreshness({ records: kernel.records, path: PATH_FRESH }, { now: staleNow })
ok(staleReading.available === true && staleReading.stale === true && staleReading.ageMs > staleReading.staleAfterMs,
  '★ stale state under an injected now: the SAME rows answer stale=true (computed, not stored)', { stale: staleReading.stale, ageMs: staleReading.ageMs, after: staleReading.staleAfterMs })
ok(staleReading.overdueDays >= 30 && typeof staleReading.means === 'string' && /逾期/.test(staleReading.means) && /lastStaleSeenAt/.test(staleReading.means),
  '★ means is NON-EMPTY for the stale state AND names the consequence path (adopt still works, the overdue is recorded)', String(staleReading.means).slice(0, 140))
ok(staleReading.lastStaleSeenAt === null && staleReading.persist.attempted === false && staleReading.persist.written === false,
  '★ blueprintFreshness stays PURE even when stale: it reports the overdue, it does not write the mark', { lastStaleSeenAt: staleReading.lastStaleSeenAt, persist: staleReading.persist })
const beforePersist = BLUEPRINT.readBlueprint({ records: kernel.records, id: freshAdopt.id })
ok(beforePersist.ok && beforePersist.fields.lastStaleSeenAt === undefined,
  '★ before the state read the row has NO lastStaleSeenAt (the pure reader could not have added it)', beforePersist.fields && beforePersist.fields.lastStaleSeenAt)

console.log('=== 5. B4: THE state READ PERSISTS THE OVERDUE ONCE, AND LATER READS SEE IT ===')
const staleState = BLUEPRINT.blueprintState({ records: kernel.records, path: PATH_FRESH, now: staleNow })
ok(staleState.stale === true && staleState.freshness && staleState.freshness.stale === true,
  '★ the state read-out carries the SAME freshness object (one shape, two readers)', { stale: staleState.stale, freshnessStale: staleState.freshness && staleState.freshness.stale })
ok(staleState.freshness.persist.attempted === true && staleState.freshness.persist.written === true,
  '★ the overdue is WRITTEN into the row by the state read (the consequence path exists)', staleState.freshness.persist)
ok(staleState.lastStaleSeenAt === staleNow && staleState.freshness.lastStaleSeenAt === staleNow,
  'the persisted stamp is the INJECTED now (the clock is honest, not the wall clock)', { top: staleState.lastStaleSeenAt, freshness: staleState.freshness.lastStaleSeenAt })
const afterPersist = BLUEPRINT.readBlueprint({ records: kernel.records, id: freshAdopt.id })
ok(afterPersist.ok && afterPersist.fields.lastStaleSeenAt === new Date(staleNow).toISOString(),
  '★ a LATER READ sees the history: the row itself now says lastStaleSeenAt (a fact on disk, not a transient flag)', afterPersist.fields && afterPersist.fields.lastStaleSeenAt)
const freshAfter = BLUEPRINT.blueprintFreshness({ records: kernel.records, path: PATH_FRESH }, { now: staleNow + 1000 })
ok(freshAfter.stale === true && freshAfter.lastStaleSeenAt === staleNow,
  '★ the PURE reader also sees the persisted overdue mark on the next read (freshness carries history)', { stale: freshAfter.stale, lastStaleSeenAt: freshAfter.lastStaleSeenAt })
const staleAgain = BLUEPRINT.blueprintState({ records: kernel.records, path: PATH_FRESH, now: staleNow + 9000 })
ok(staleAgain.lastStaleSeenAt === staleNow && staleAgain.freshness.persist.attempted === false && staleAgain.freshness.persist.written === false,
  '★ IDEMPOTENT: a second overdue read does not rewrite the same adopted revision', { lastStaleSeenAt: staleAgain.lastStaleSeenAt, persist: staleAgain.freshness.persist })
const lateAdoptDraft = BLUEPRINT.proposeBlueprint({ records: kernel.records, path: PATH_FRESH, text: '逾期后的新版：维护节奏改为两周。', by: 'r-2', seat: 'member', at: staleNow + 10000 })
ok(lateAdoptDraft.ok && lateAdoptDraft.continued === false && lateAdoptDraft.revision === 2,
  'a NEW revision can be proposed after an overdue one (stale never blocks work)', { revision: lateAdoptDraft.revision, continued: lateAdoptDraft.continued })
const lateCont = await call({ action: 'propose', member: 'acad', path: PATH_FRESH, text: '院士对逾期版的共同设计：按两周复查。' })
ok(lateCont.ok && lateCont.parsed.continued === true, 'the co-design gate applies to the late revision too (same mechanism, no bypass)', lateCont.parsed && lateCont.parsed.id)
const lateAdopt = BLUEPRINT.adoptBlueprint({ records: kernel.records, path: PATH_FRESH, draft: lateAdoptDraft.id, by: 'acad', at: staleNow + 20000 })
ok(lateAdopt.ok === true && lateAdopt.overdueUpdate === true && lateAdopt.previousAgeMs > BLUEPRINT.BLUEPRINT_STALE_AFTER_MS,
  '★ B4 measured consequence: adopt STILL WORKS, but replacing an overdue revision is reported as overdueUpdate=true', { overdueUpdate: lateAdopt.overdueUpdate, previousAgeMs: lateAdopt.previousAgeMs })
ok(/overdueUpdate|逾期/.test(lateAdopt.note), 'the late adopt receipt SAYS it was a late update (the agent acting on it is not left to guess)', lateAdopt.note)
const toolStale = await call({ action: 'state', path: PATH_FRESH })
ok(toolStale.ok && toolStale.parsed.freshness && typeof toolStale.parsed.freshness.means === 'string' && toolStale.parsed.freshness.means.length > 0,
  '★ the TOOL state receipt carries `freshness` (turn assembly can read the same object the module returns)', toolStale.parsed && toolStale.parsed.freshness && { stale: toolStale.parsed.freshness.stale, means: String(toolStale.parsed.freshness.means).slice(0, 70) })
const toolRead = await call({ action: 'read', path: PATH_FRESH, id: lateAdopt.id })
ok(toolRead.ok && toolRead.parsed.fields && toolRead.parsed.fields.authors !== undefined,
  '★ the tool read receipt still surfaces the row fields, so the co-design authors are readable by id', toolRead.parsed && toolRead.parsed.fields && toolRead.parsed.fields.authors)
const noCarrier = BLUEPRINT.blueprintFreshness({}, { now: 0 })
ok(noCarrier.available === false && noCarrier.stale === false && typeof noCarrier.means === 'string' && noCarrier.means.length > 0,
  '★ zero-mechanism control: no records face ⇒ available=false + a non-empty means ("cannot answer" is not "up to date")', noCarrier && { available: noCarrier.available, means: String(noCarrier.means).slice(0, 80) })
const noPath = BLUEPRINT.blueprintFreshness({ records: kernel.records }, { now: 0 })
ok(noPath.available === false && typeof noPath.means === 'string' && noPath.means.length > 0,
  'an empty path is also reported as unavailable with a means (never a fake fresh)', noPath && { available: noPath.available, reason: noPath.reason })

console.log('=== 6. NAMED REFUSALS ARE ALL THREE-PIECE (code + message + hint), AND HISTORY DATA SAYS SO ===')
const emptyText = await call({ action: 'propose', member: 'r-1', text: '   ' })
const ghost = await call({ action: 'propose', member: 'r-ghost', text: 'x' })
const noAuthor = await call({ action: 'propose', text: 'x' })
const badAction = await call({ action: 'explode' })
const unknownDraft = await call({ action: 'adopt', member: 'acad', draft: 'no-such-row' })
const legacyDraft = await call({ action: 'propose', member: 'r-1', path: PATH_WRONG, text: '一版只有单个作者的草案。' })
const wrongPath = await call({ action: 'adopt', member: 'acad', path: PATH, draft: legacyDraft.parsed.id })
const collect = [emptyText, ghost, noAuthor, badAction, unknownDraft, wrongPath]
ok(collect.every((r) => r.ok === false), 'all six refusals below really refused (RULE E: the set is non-empty and negative)', collect.map((r) => r.code))
ok(collect.every((r) => triple(r)), '★ every refusal carries code + message + hint (the three-piece contract)', collect.map((r) => ({ code: r.code, hint: String(r.hint || '').slice(0, 40) })))
ok(collect.every((r) => typeof r.code === 'string' && /^VMU_[A-Z_]{4,}$/.test(r.code)), 'every refusal code is a named VMU_* code, never a bare exception', collect.map((r) => r.code))

// ★ HISTORICAL DATA: a row with NO authors field (written before this mechanism) is refused as "no co-design record",
// and the message says it is historical data — not "you forgot", and not a silent pass.
const legacyBody = [
  '- path：' + PATH_WRONG,
  '- status：draft',
  '- revision：1',
  '- proposedBy：r-1',
  '- proposedAt：' + new Date(T0).toISOString(),
  '## 正文',
  '机制上线前写下的草案：没有 authors 字段。',
].join('\n')
const legacyPut = kernel.records.put({ track: 'blueprint', kind: 'blueprint', title: '蓝图｜' + PATH_WRONG + '｜r1｜草案', body: legacyBody, settled: false, by: 'r-1' })
ok(legacyPut && legacyPut.ok !== false && typeof legacyPut.id === 'string', 'fixture: a pre-mechanism row (no authors field) was written (RULE E)', legacyPut && legacyPut.id)
const legacyAdopt = await call({ action: 'adopt', member: 'acad', path: PATH_WRONG, draft: legacyPut.id })
ok(legacyAdopt.ok === false && legacyAdopt.code === 'VMU_PACK_V5R_BLUEPRINT_NEEDS_CODESIGN',
  '★ B5: a draft with EMPTY authors is refused by the co-design code (old data cannot pass as co-designed)', legacyAdopt.code)
ok(/历史数据/.test(legacyAdopt.message) && /authors/.test(legacyAdopt.message) && /proposedBy/.test(legacyAdopt.message),
  '★ the refusal SAYS it is historical data (authors 为空 + the old proposedBy) instead of pretending a missing record is a design', legacyAdopt.message)
ok(triple(legacyAdopt) && /propose/.test(legacyAdopt.hint) && /adopt/.test(legacyAdopt.hint),
  'its hint gives the copy-pasteable next calls (propose for both seats, then adopt)', String(legacyAdopt.hint).slice(0, 120))

console.log('=== 7. THE MECHANISMS DO NOT LEAK: STATE AFTER ALL REFUSALS ===')
const endState = await call({ action: 'state', path: PATH_WRONG })
ok(endState.parsed && endState.parsed.hasCurrent === false && endState.parsed.draftsWaiting === 2,
  '★ neither the pre-mechanism row nor the single-author draft was adopted: no current revision on that path (two drafts waiting: the refused one + the historical row)', endState.parsed && { hasCurrent: endState.parsed.hasCurrent, drafts: endState.parsed.draftsWaiting })
const endProtocol = await call({ action: 'state', path: PATH })
ok(endProtocol.parsed && endProtocol.parsed.hasCurrent === true && endProtocol.parsed.revisions === 2,
  '★ the refused adoptions on the other path wrote nothing: r1 is still the only round (2 rows: draft + adoption)', endProtocol.parsed && { revision: endProtocol.parsed.currentRevision, revisions: endProtocol.parsed.revisions })

await rm(main.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
console.log('')
if (failures.length > 0) { console.log('FAILURES:'); for (const f of failures) console.log('  · ' + f); process.exitCode = 1 }
console.log('passed=' + passed + ' failed=' + failed)
