// RUN 249-B — the 69th real-machine run found three places where a receipt asserted something that did not happen,
// and two places where the copy promised one thing while the face did another. Each section below pins ONE repair on
// the face a caller actually talks to, and keeps the old intent visible in its label:
//
//   F-04 (中) `rec-10`/`rec-14` came back with owner/writer/by ALL null — a feedback card nobody authored. The write path
//             now REFUSES by name when no `member` (and no call context) names an author.
//   F-05 (中) `expand rec-21` recorded the writer `"argument"` — a FIELD-SOURCE word — as the author. A settlement now
//             writes the REAL actor, and when the writer genuinely came from an argument the receipt says so.
//   D    (中) `vibe_v5_record_proposition` wrote `proof_state:"draft"` while its `proofGate` said `locked:true` with
//             "the declared proof is registered complete". The gate now locks on a DOUBLE condition (complete AND the
//             pointer resolves); a draft is never locked and every gate shape names its reason + `proofRefState`.
//   A    (中) `vibe_v5_verdict_ask` was documented to refuse `VMU_ASK_UNKNOWN_PROPOSITION` for a name it cannot check,
//             but it answered `ok:true`, `propositionKind:"unverified"` and MAILED every member. It now refuses.
//   F-08 (低) `final` recorded 69,726 B while the newest `compile` recorded 69,725 B and `compiledAfterFinal:true` —
//             two numbers and no field saying which RECORD wrote the file on disk. `diskFileFromRecord` says it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const PACK = readFileSync(join(ROOT, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')

let n = 0
const ok = (cond, msg, extra) => {
  n += 1
  assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
}
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)
const hasNot = (hay, needle, msg) => ok(!String(hay).includes(needle), msg + ' — found (must be gone): ' + needle)
const eq = (actual, expected, msg) => ok(actual === expected, msg, { actual, expected })

const tmp = () => mkdtempSync(join(tmpdir(), 'vmu-run249-'))
const R = (r) => r || { ok: false }

async function boot(dir) {
  const entry = await import(pathToFileURL(ENTRY).href)
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { async register(s) { specs.push(s); return () => {} } } }
  const handle = await entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root: dir })
  await handle.ready()
  await handle.kernel.store.open()
  const call = async (name, args = {}) => {
    const spec = specs.filter((x) => x && x.name === name)[0]
    if (!spec) return { ok: false, code: 'NO_SUCH_FACE', message: name }
    const raw = await spec.execute(args, { kernel: handle.kernel })
    return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
  }
  return { handle, call, kernel: handle.kernel, specs }
}

const root = tmp()
const b = await boot(root)
for (const [id, slot] of [['acad-01', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) {
  await b.kernel.members.hire({ id, slot, institution: 'sim' })
}

test('§0 every repair is on the source that owns it (source pins, so §1-§5 cannot pass by accident)', () => {
  has(PACK, 'no author: neither `member` nor the call context names one', '§0a ★★ F-04: the feedback face refuses a write it cannot attribute')
  has(PACK, 'const authorOf = ()', '§0b ★★ F-04: one resolver decides the author (member first, then the call context)')
  has(PACK, "const SOURCE_WORD = /^(argument|caller|unknown|field-argument", '§0c ★★ F-05: source words are named as source words, not authors')
  has(PACK, "'debate-ruling'", '§0d ★ F-05: a ruling signer is a second honest source of the writer')
  has(PACK, 'writerSourceMeans', '§0e ★ F-05: the receipt says WHERE the writer came from')
  has(PACK, "reason: declaredProofStateFolded === 'draft' ? 'declared-draft' : 'declared-not-complete'", '§0f ★★★ D: a non-complete declaration can never report locked')
  has(PACK, "reason: 'complete-but-pointer-unresolved'", '§0g ★★ D: complete + unresolvable pointer is its own named shape')
  // ★ RUN 2699 (F75-04): the pointer state now comes from the ONE judge (`proofGateFinal`) and carries whether it was
  // actually CHECKED, so the pin moves to the receipt key plus the checked flag instead of the retired local variable.
  has(PACK, 'proofRefState: proofGateFinal.proofRefState', '§0h ★★ D: every receipt carries the pointer state it read')
  has(PACK, 'proofRefStateChecked: proofGateFinal.proofRefStateChecked', '§0h2 ★★★ F75-04: and whether it was measured at all')
  hasNot(PACK, "kind: 'unverified'", '§0i ★★★ A: the `unverified` answer is gone from the face (its own description promised a refusal)')
  has(PACK, 'diskFileFromRecord: ledger.id === undefined ? null : ledger.id', '§0j ★★ F-08: the compile ledger row that wrote the disk file is a field')
  has(PACK, 'diskFileFromRecordMeans', '§0k ★ F-08: and the receipt says how to read it against `compiledAfterFinal`')
})

test('§1 F-04 — a feedback card with no author is REFUSED, and the refusal names the repair', async () => {
  const base = { op: 'add', category: '协作', route: 'process', phenomenon: '分派缺验收标准', impact: '返工', action: '分派时写验收' }
  // OLD INTENT (run 50 / F-32): "a tool name is not an author" — the face wrote `by:null` and left it at that.
  // MEASURED (run 69 / F-04): rec-10/rec-14 came back with owner/writer/by ALL null. NEW PROOF: the row is not
  // written at all, and the receipt names the missing author and the way to supply it.
  const refused = await b.call('vibe_v5_feedback', base)
  eq(refused.ok, false, '§1a ★★★ a feedback add with NO member is refused (no more null-author rows)')
  eq(refused.code, 'VMU_INVALID_ARGUMENT', '§1b ★★ and the refusal is a NAMED code, not a silent skip')
  ok(/no author/.test(String(refused.message)), '§1c ★ the message says what is missing (an author)', { message: refused.message })
  ok(/member/.test(String(refused.hint)), '§1d ★★ and the hint names the reachable repair (`member`)', { hint: refused.hint })

  const filed = await b.call('vibe_v5_feedback', Object.assign({}, base, { member: 'r-1' }))
  eq(filed.ok, true, '§1e ★ precondition: the attributed call is accepted')
  const got = b.kernel.records.get({ id: filed.recordId })
  const row = got && got.record ? got.record : got
  eq(row.owner, 'r-1', '§1f ★★★ the row records the REAL member as owner (the measured defect: null)')
  ok(row.by === 'r-1' || row.by === undefined, '§1g ★ and the writer is the member, never a tool name', { by: row.by })

  // The update path had the same hole (`by: str(args.member) || null`).
  const upd = await b.call('vibe_v5_feedback', { op: 'update', id: filed.recordId, status: 'closed', outcome: '已改分派模板' })
  eq(upd.ok, false, '§1h ★★ an UPDATE with no author is refused too (both write paths, not just add)')
  eq(upd.code, 'VMU_INVALID_ARGUMENT', '§1i ★ and by the same name', { code: upd.code })
})

test('§2 F-05 — a ruling settlement writes the REAL writer, never the word "argument"', async () => {
  // A settlement needs a ruling this kernel can RESOLVE, so the setup runs a real debate: card → meeting → both
  // members FILE their verdicts (`vibe_v5_verdict`) → `verdict_final` names the aggregate → the chair's correction call.
  const rulingFor = async (tag) => {
    const c = R(await b.call('vibe_v5_record_proposition', {
      statement: 'r249 §2 ' + tag + ' 命题', value: 'objects', motive: 'run249 §2', p: 0.5, member: 'r-1',
    }))
    ok(c.ok === true, '§2 precondition: a card exists to settle (' + tag + ')', { code: c && c.code })
    const mid = (R(await b.call('vibe_v5_meeting', { agenda: 'run249 §2 ' + tag, type: 'ordinary', member: 'acad-01' }))).meeting
    for (const m of ['acad-01', 'r-1', 'r-2']) await b.call('vibe_vmu_meeting', { action: 'attend', id: mid, member: m })
    for (const m of ['r-1', 'r-2']) {
      const v = R(await b.call('vibe_v5_verdict', { meeting: mid, proposition_id: c.recordId, verdict: 1, reason: 'r249 ' + m, member: m }))
      ok(v.ok === true, '§2 precondition: ' + m + ' filed a verdict (' + tag + ')', { code: v && v.code, message: v && v.message })
    }
    return { cardId: c.recordId, mid }
  }
  const settle = (cardId, mid, extra) => b.call('vibe_v5_record_proposition', Object.assign({
    id: cardId, statement: 'r249 §2 命题', value: 'objects', motive: 'run249 §2', p: 1,
    // The chair's ruling object, exactly the shape `verdict_final.correction.call` prints: subject/value/mode +
    // ballotId (the RULING AGGREGATE `tally-<meeting>-<card>`, never a ballot box) + meeting + by (the signer).
    debate_ruling: { subject: cardId, value: 1, mode: 'unanimous', n: 2, decided: true, ballotId: 'tally-' + mid + '-' + cardId, meeting: mid, by: 'acad-01' },
  }, extra || {}))

  // OLD INTENT: the settlement's author must be a person answerable for the ruling — MEASURED (run 69 / F-05):
  // `expand rec-21` answered writer `"argument"`, the name of the FIELD the value came from. NEW PROOF: the writer is a
  // real member id (the chair who signed the ruling) and the receipt says WHICH source produced it.
  const a = await rulingFor('a')
  const s1 = R(await settle(a.cardId, a.mid))
  eq(s1.ok, true, '§2a precondition: the ruling settlement is admitted (rule L53)', s1 && { code: s1.code, message: s1.message })
  const set1 = s1.settlement || null
  ok(set1 !== null, '§2b ★ precondition: the receipt carries the settlement block', Object.keys(s1 || {}).slice(0, 12))
  eq(set1 && set1.writer, 'acad-01', '§2c ★★★ the writer is the chair who SIGNED the ruling — never the word "argument" (the measured defect)', set1 && set1.writer)
  ok(set1 && set1.writer !== 'argument', '§2d ★★★ the field-source word is not an author (the literal measured value)', { writer: set1 && set1.writer })
  eq(set1 && set1.writerSource, 'debate-ruling', '§2e ★★ and the receipt says WHERE the writer came from (the ruling, not the argument)', set1 && set1.writerSource)
  ok(set1 && typeof set1.writerSourceMeans === 'string' && /SIGNED the ruling/.test(set1.writerSourceMeans),
    '§2f ★ the means names the act being recorded (the chair ruling), not the parameter', set1 && set1.writerSourceMeans)
  const row1 = ((g) => (g && g.record ? g.record : g))(b.kernel.records.get({ id: a.cardId }))
  eq(row1 && row1.by, 'acad-01', '§2g ★★★ the ROW itself records that member as its author (the measured defect wrote "argument")', { by: row1 && row1.by })

  const c2 = await rulingFor('b')
  const s2 = R(await settle(c2.cardId, c2.mid, { member: 'r-1' }))
  eq(s2.ok, true, '§2h precondition: the attributed settlement is admitted', s2 && { code: s2.code, message: s2.message })
  const set2 = s2.settlement || null
  eq(set2 && set2.writer, 'r-1', '§2i ★★★ a settlement that NAMES a member records that member as the writer', set2 && set2.writer)
  eq(set2 && set2.writerSource, 'field-argument', '§2j ★★★ and says the writer came from the argument — honest about provenance', set2 && set2.writerSource)
})

test('§3 D — proofGate locks on a DOUBLE condition: complete AND the pointer resolves', async () => {
  // OLD INTENT (rule L14): a COMPLETE registration must be locked so the proof cannot be rewritten. MEASURED (run 69 /
  // D, rec-6): a `draft` registration answered `locked:true, why:"the declared proof is registered complete…"` beside
  // `proofLockDeferred:"pointer:missing"` — the receipt reported a lock that did not exist.
  const draft = R(await b.call('vibe_v5_record_proposition', {
    statement: 'r249 §3 draft 命题', value: 'objects', motive: 'run249 §3', p: 0.5, proof_state: 'draft', member: 'r-1',
  }))
  eq(draft.ok, true, '§3a precondition: a card declaring `proof_state:"draft"` is admitted', draft && { code: draft.code, message: draft.message })
  const gateDraft = draft.proofGate || null
  eq(gateDraft && gateDraft.locked, false, '§3b ★★★ a DRAFT is NOT locked (the measured defect said locked:true)', gateDraft)
  eq(gateDraft && gateDraft.reason, 'declared-draft', '§3c ★★ and the gate names the reason as a field, not a sentence', gateDraft && gateDraft.reason)
  eq(gateDraft && gateDraft.proofRefState, 'absent', '§3d ★ where no pointer was declared, proofRefState says absent', gateDraft && gateDraft.proofRefState)
  ok(gateDraft && /NOT complete/.test(String(gateDraft.why)), '§3e ★ and the why says the declaration is what keeps it writable', gateDraft && gateDraft.why)

  const unresolved = R(await b.call('vibe_v5_record_proposition', {
    statement: 'r249 §3 unresolved 命题', value: 'objects', motive: 'run249 §3', p: 0.5,
    proof_state: 'complete', proof_ref: 'r249-missing-proof.md', member: 'r-1',
  }))
  eq(unresolved.ok, true, '§3f precondition: a complete declaration with a pointer is admitted', unresolved && { code: unresolved.code, message: unresolved.message })
  const gateUnresolved = unresolved.proofGate || null
  eq(gateUnresolved && gateUnresolved.locked, false, '§3g ★★★ complete + an UNRESOLVABLE pointer is NOT locked either (the lock would be a claim)', gateUnresolved)
  eq(gateUnresolved && gateUnresolved.reason, 'complete-but-pointer-unresolved', '§3h ★★ and it is its own named reason', gateUnresolved && gateUnresolved.reason)
  eq(gateUnresolved && gateUnresolved.proofRefState, 'missing', '§3i ★ proofRefState names the failed lookup', gateUnresolved && gateUnresolved.proofRefState)
  eq(unresolved.proofRefState, 'missing', '§3j ★★ the receipt ALSO carries the pointer state at top level (a reader not opening proofGate sees it)', unresolved.proofRefState)

  // The double condition must still lock what it exists to lock: a COMPLETE registration whose pointer really resolves.
  const libRoot = (() => { try { return b.kernel.library && typeof b.kernel.library.root === 'string' ? b.kernel.library.root : null } catch (e) { return null } })()
  ok(libRoot !== null, '§3k precondition: the kernel exposes a library root to resolve pointers against', { libRoot })
  if (libRoot !== null) {
    mkdirSync(libRoot, { recursive: true })
    writeFileSync(join(libRoot, 'r249-proof.md'), '# r249 proof\n\ncomplete registration.\n')
    const locked = R(await b.call('vibe_v5_record_proposition', {
      statement: 'r249 §3 locked 命题', value: 'objects', motive: 'run249 §3', p: 0.5,
      proof_state: 'complete', proof_ref: 'r249-proof.md', member: 'r-1',
    }))
    eq(locked.ok, true, '§3l precondition: the resolvable complete registration is admitted', locked && { code: locked.code, message: locked.message })
    const gateLocked = locked.proofGate || null
    eq(gateLocked && gateLocked.locked, true, '§3m ★★★ complete AND resolving ⇒ LOCKED (the gate still protects a real complete registration)', gateLocked)
    eq(gateLocked && gateLocked.reason, 'complete-and-resolved', '§3n ★ and the reason says both halves held', gateLocked && gateLocked.reason)
    eq(gateLocked && gateLocked.proofRefState, 'resolved', '§3o ★ proofRefState says resolved', gateLocked && gateLocked.proofRefState)
    const again = await b.call('vibe_v5_record_proposition', {
      statement: 'r249 §3 locked 命题', value: 'objects', motive: 'run249 §3 again', p: 0.4, member: 'r-1', id: locked.recordId,
    })
    eq(again.ok, false, '§3p ★★ the lock is REAL: a later write to the locked card id is refused (the gate was not weakened into prose)', { code: again.code })
  }
})

test('§4 A — an ask about a proposition nothing can check is REFUSED before any mail exists', async () => {
  // OLD INTENT (run 29 §3c): the unregistered one-line object was a "documented v5r allowance" — accepted and labelled
  // `unverified`, with the ask mailed. MEASURED (run 69 / A, rec-3): the description promised
  // `VMU_ASK_UNKNOWN_PROPOSITION`; the face answered `ok:true` and delivered mail to ["r-1","r-2"]. NEW PROOF: the
  // refusal happens BEFORE the mail, so no member is asked to rule on a target nobody can aggregate.
  const mid = (R(await b.call('vibe_v5_meeting', { agenda: 'run249 §4', type: 'ordinary', member: 'acad-01' }))).meeting
  ok(typeof mid === 'string' && mid.length > 0, '§4a precondition: a meeting was convened with no debate subject', { mid })
  for (const m of ['acad-01', 'r-1', 'r-2']) await b.call('vibe_vmu_meeting', { action: 'attend', id: mid, member: m })

  const inboxBefore = R(await b.call('vibe_v5_inbox', { member: 'r-1', status: 'all' }))
  const rowsBefore = Array.isArray(inboxBefore.rows) ? inboxBefore.rows.length : -1
  ok(rowsBefore >= 0, '§4b precondition: the member inbox is readable (so "no new mail" is measurable)', { rows: rowsBefore })

  const refused = await b.call('vibe_v5_verdict_ask', { meeting: mid, proposition_id: 'p-rulecheck-不存在' })
  eq(refused.ok, false, '§4c ★★★ the ask on a name nothing can check is REFUSED (the description promised this)')
  eq(refused.code, 'VMU_ASK_UNKNOWN_PROPOSITION', '§4d ★★★ and by the promised code', { code: refused.code })
  ok(String(refused.message).includes('p-rulecheck-不存在'), '§4e ★ the refusal names the object it could not check', { message: refused.message })
  const hint = String(refused.hint || '')
  ok(/record the proposition first/.test(hint), '§4f ★★ the hint names the first repair (record the card, pass its id)', { hint })
  ok(/FILE/.test(hint), '§4g ★★ the second repair (a FILE reference) is named — the legal file-ref shape stays reachable', { hint })
  ok(/debate/.test(hint), '§4h ★ the third repair (the object the debate was convened on) is named', { hint })

  const inboxAfter = R(await b.call('vibe_v5_inbox', { member: 'r-1', status: 'all' }))
  const rowsAfter = Array.isArray(inboxAfter.rows) ? inboxAfter.rows.length : -1
  eq(rowsAfter, rowsBefore, '§4i ★★★ NOTHING was mailed: the member inbox row count is unchanged by the refused ask')
  const delivered = Array.isArray(refused.delivered) ? refused.delivered.length : 0
  eq(delivered, 0, '§4j ★★ and the refusal reports NO delivery (the measured defect mailed ["r-1","r-2"])', { delivered: refused.delivered })

  // The refusal must not narrow the face: a card the library HOLDS is still a legal target and still reaches members.
  const card = R(await b.call('vibe_v5_record_proposition', {
    statement: 'r249 §4 命题：a+b=b+a', value: 1, motive: '交换律', p: 0.5, member: 'r-1',
  }))
  eq(card.ok, true, '§4k precondition: a card was recorded', { code: card.code })
  const askedCard = R(await b.call('vibe_v5_verdict_ask', { meeting: mid, proposition_id: card.recordId }))
  eq(askedCard.ok, true, '§4l ★★ a card the library holds is still accepted (the repair is a refusal of the uncheckable shape, not a closure of the face)', { code: askedCard.code })
  eq(askedCard.propositionKind, 'card', '§4m ★ and it is labelled `card` — the legal kinds survive', { kind: askedCard.propositionKind })
})

test('§5 F-08 — the paper status names WHICH record wrote the file on disk', async () => {
  // OLD INTENT (RUN 195): `compiledAfterFinal` says the disk file is a DIFFERENT compile than the finalisation. MEASURED
  // (run 69 / F-08): final 69,726 B (rec-31) vs compile 69,725 B (rec-32) with compiledAfterFinal:true — a reader could
  // not answer "which record wrote the file I can open". `diskFileFromRecord` answers it by name.
  const started = R(await b.call('vibe_v5_paper', { action: 'start', target: 'p-r249', participants: ['r-1', 'r-2'] }))
  eq(started.ok, true, '§5a precondition: a paper was started', { code: started.code, message: started.message })

  // (1) No compile ledger row at all: the absence is a FIELD, not silence.
  const noCompile = R(await b.call('vibe_v5_paper', { action: 'status', target: 'p-r249' }))
  eq(noCompile.ok, true, '§5b precondition: status is readable', { code: noCompile.code })
  const pc0 = noCompile.pdfCompiled || {}
  eq(pc0.produced, false, '§5c ★ precondition: this paper has not compiled', pc0)
  eq(pc0.diskFileFromRecord, null, '§5d ★★ with no compile row there is no record that could have written the file (null, named)', pc0)
  ok(/NO compile ledger row/.test(String(pc0.diskFileFromRecordMeans || '')), '§5e ★ and the receipt says exactly that instead of leaving `recordId:null` to be read as "a file exists but nobody wrote it"', { means: pc0.diskFileFromRecordMeans })

  // (2) The measured shape: the finalisation recorded one compile, the newest compile is a DIFFERENT row.
  const list = b.kernel.records.list({ track: 'paper', limit: 0 })
  const items = Array.isArray(list) ? list : (Array.isArray(list && list.items) ? list.items : [])
  const stateHead = items.filter((r) => String(r.kind || '') === 'paper-state' && String(r.title || '').includes('p-r249'))[0]
  ok(stateHead !== undefined && stateHead.id !== undefined, '§5f precondition: the paper state row is on the ledger', { count: items.length })
  const ledger = b.kernel.records.put({
    track: 'paper', kind: 'paper-pdf', title: 'paper|p-r249|pdf',
    body: JSON.stringify({ pdfPath: join(root, 'Paper', 'p-r249', 'p-r249.pdf'), pdfBytes: 69725, engine: 'r249-fake', tried: [] }),
    by: 'r-1',
  })
  ok(ledger && ledger.id, '§5g precondition: a compile ledger row was planted (the newest compile)', ledger)
  const stateGot = b.kernel.records.get({ id: stateHead.id })
  const stateRow = stateGot && stateGot.record ? stateGot.record : stateGot
  const stateBody = JSON.parse(String(stateRow.body || '{}'))
  stateBody.finalPdfRecordId = 'rec-31-final'
  stateBody.finalPdfBytes = 69726
  b.kernel.records.supersede({ id: stateHead.id, body: JSON.stringify(stateBody), by: 'r-1', reason: 'run249 §5 plant: the finalisation recorded rec-31-final (69726 B) while the newest compile is another row' })

  const st = R(await b.call('vibe_v5_paper', { action: 'status', target: 'p-r249' }))
  eq(st.ok, true, '§5h precondition: status is readable after the plant', { code: st.code })
  const pc = st.pdfCompiled || {}
  eq(pc.produced, true, '§5i ★★ precondition: the compile ledger row is read', pc && { produced: pc.produced })
  eq(pc.diskFileFromRecord, ledger.id, '§5j ★★★ diskFileFromRecord is the row that wrote the file on disk (the measured gap)', { disk: pc.diskFileFromRecord, ledger: ledger.id })
  eq(pc.diskFileBytes, 69725, '§5k ★ diskFileBytes is that row\'s byte count, not the finalisation\'s', { bytes: pc.diskFileBytes })
  eq(pc.finalPdfRecordId, 'rec-31-final', '§5l ★ the finalisation is still printed beside it', { final: pc.finalPdfRecordId })
  eq(pc.finalPdfBytes, 69726, '§5m ★ with its own byte count (the two numbers the 69th run measured)', { bytes: pc.finalPdfBytes })
  eq(pc.compiledAfterFinal, true, '§5n ★★ compiledAfterFinal still says those are different compiles', { after: pc.compiledAfterFinal })
  const means = String(pc.diskFileFromRecordMeans || '')
  ok(means.includes(String(ledger.id)) && means.includes('rec-31-final') && /compiledAfterFinal/.test(means),
    '§5o ★★ the means names BOTH records and points the reader at `compiledAfterFinal` for the comparison', { means })
})

test('§6 cleanup', () => {
  rmSync(root, { recursive: true, force: true })
  ok(true, '§6 the temp instance was removed')
  console.log('RUN 249-B assertions:', n)
})
