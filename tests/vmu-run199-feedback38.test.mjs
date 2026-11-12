// RUN 199 — run 39 / FEEDBACK38: the readings that promised a field the other face never filled.
//
// 1.2  `requiredLines[].requiredLineFull` was null while `requiredLineTruncated` was true — the READ face read
//      `item.statement`, a field `view.verified()` never returns, so the answer was null BY CONSTRUCTION while the
//      same receipt's `means` promised it.
// 1.3  `advance.refusers` mixed three facts (a real "not deliverable" vote, a row from ANOTHER round, and no row at
//      all) into one list, while `reviewsRead` called the stale ones "a ROUND MISMATCH, not a member refusing".
// 1.4  `final.conclusion` stayed "" when only a `note` was passed, although the schema calls `conclusion` the paper's
//      final conclusion and `body` its alias.
// 2.1  the SECOND `VMU_TURN_NO_PENDING_MEMBER` site named the delivery paths in prose only (no CALLER/DELEGATED labels).
// 2.2  `op:"reply"` with a `reply` string was refused as "this call carries BOTH a tool report and a text reply" even
//      when NO report was passed — the op IS the report channel.
// 2.4  convening a closure meeting with `subject` was refused without a minimal call for that type (nor the agenda).
// 1.1  a `proof_ref` self-report was accepted with no note that the pointer is resolved against the LIBRARY root and
//      that a `complete` card is LOCKED (so the pointer cannot be corrected afterwards).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const QUALITY = join(ROOT, 'vibe-math-vmu', 'packs', 'v5r', 'paper-quality.js')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const PQ = read('vibe-math-vmu/packs/v5r/paper-quality.js')
const PAPER = read('vibe-math-vmu/kit/paper.js')
const TURNK = read('vibe-math-vmu/kernel/turn/index.js')
const TURN = read('vibe-math-vmu/tools/turn.js')
const PACK = read('vibe-math-vmu/packs/v5r/tools.js')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)
// ★ MEASURED SHAPE (run 199): a paper action answers as { ok, tool, action, <the action's own name>: <block>, receiptMeta }.
// Reading one layer short is how a receipt field "disappears" — the first version of §2/§3 asserted `r.to`/`r.final` and
// got undefined while the value was right there one level down.
const advanceOf = (r) => (r && r.advance) || r

async function assemble(dir, opts = {}, entryUrl = null) {
  const entry = await import(entryUrl || pathToFileURL(ENTRY).href)
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { async register(s) { specs.push(s); return () => {} } } }
  const handle = await entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root: dir, ...(opts.vmu ? { vmu: opts.vmu } : {}) })
  await handle.ready()
  await handle.kernel.store.open()
  const call = async (name, args) => {
    const s = specs.filter((x) => x && x.name === name)[0]
    if (!s) throw new Error('no such face: ' + name)
    const raw = await s.execute(args, { kernel: handle.kernel })
    return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
  }
  return { handle, specs, call }
}

test('RUN 199 §0 — every repair is on the source it belongs to (source pins)', () => {
  // 1.2 ONE reader for the truncated conclusion's full sentence
  has(PQ, 'function statementOfCardOf(recordsFace, cardId)', '§0a ★ the full sentence is read by ONE function')
  has(PQ, 'const statementOfCard = statementOfCardOf', '§0b the delivery gate calls that same reader')
  has(PQ, 'const recordsFace = view && view.records ? view.records : null', '§0c ★ the READ face keeps the records face it needs')
  has(PQ, 'requiredLineFullWhy:', '§0d and a null now comes with a reason')
  // 1.3 three facts under three names
  has(PAPER, 'const notYetReviewed = verdicts.filter', '§0e ★ "not asked yet" is its own list, not a refusal')
  has(PAPER, 'const stale = verdicts.filter', '§0f ★ and "a row from another round" is its own list')
  has(PAPER, 'if (refusers.length === 0 && pendingNames.length === 0) {', '§0g ★ unanimity needs all three empty')
  has(PAPER, 'staleMeans:', '§0h the disagreement receipt names the stale list')
  has(PAPER, 'notYetReviewedMeans:', '§0i and the never-asked list')
  has(PAPER, 'RUN 199 (run 39 / FEEDBACK38 1.3, MEASURED)', '§0j the repair names the measurement it answers')
  // 1.4 the conclusion is not a third name for a note nobody passed
  has(PAPER, 'conclusionSource: conclusionGiven ?', '§0l ★ the receipt says where the conclusion came from')
  has(PAPER, 'conclusionMeans:', '§0m with the sentence that note and conclusion are not synonyms')
  // 2.1 both delivery paths labelled
  has(TURNK, 'CALLER PATH (the only one where this channel works)', '§0n ★ the caller path is labelled')
  has(TURNK, 'DELEGATED PATH (activation/one-shot)', '§0o ★ and the delegated path is labelled as an EXPECTED refusal')
  // 2.2 the reply channel says which channel it is
  has(TURN, 'is the TOOL-REPORT channel', '§0p ★ `op:"reply"` names itself as the report channel')
  has(TURN, 'the OTHER channel', '§0q and the string it carries is named as the other channel, not a report field')
  // 2.4 a minimal call per type
  has(PACK, 'MINIMAL CALL for this type', '§0r ★ the refusal hands the type it names a minimal call')
  has(PACK, 'a CLOSURE meeting takes an AGENDA and nothing else', '§0s including that a closure meeting takes an agenda')
  // 1.1 the pointer and the lock
  has(PACK, 'pointerNote:', '§0t ★ a proof_ref write says the pointer is never resolved here')
  has(PACK, 'lockNote:', '§0u and that a complete card is LOCKED, so the pointer cannot be fixed afterwards')
})

test('RUN 199 §1 — the truncated conclusion names the FULL sentence, from the card', async () => {
  const quality = await import(pathToFileURL(QUALITY).href)
  const cardBody = '- statement：对任意自然数 n，前 n 个奇数之和等于 n²（整句）\n- p：1\n'
  const fakeRecords = {
    get: ({ id }) => ({ record: { id, body: cardBody } }),
    list: () => ({ items: [] }),
  }
  const view = {
    verified: () => ({
      items: [{
        id: 'rec-9', cardId: 'rec-card', p: 1,
        title: '已验证｜对任意自然数 n，前 n 个奇数之和等于 n²：记 oddSum 0 = 0，oddSum (n…',
        warrant: 'debate', source: 'debate',
      }],
    }),
    records: fakeRecords,
  }
  const r = quality.verifiedRequirements({ view })
  ok(r.ok === true && r.count === 1, '§1a the read face answers', r)
  const item = r.items[0]
  ok(item.requiredLineTruncated === true, '§1b ★ the row name is capped (…), so the full sentence is required', item)
  ok(item.requiredLineFull === '对任意自然数 n，前 n 个奇数之和等于 n²（整句）',
    '§1c ★★ requiredLineFull is the CARD statement — it used to be null by construction', item)
  ok(/CARD statement line/.test(String(item.requiredLineFullWhy || '')), '§1d and says where the sentence was read back from', item)
  // a card with no readable statement: the field is still null, but the WHY is a reading, not a shrug
  const bare = quality.verifiedRequirements({
    view: { verified: () => ({ items: [view.verified().items[0]] }), records: { get: () => ({ record: { id: 'rec-card', body: 'no statement line' } }), list: () => ({ items: [] }) } },
  })
  ok(bare.items[0].requiredLineFull === null, '§1e no readable statement ⇒ no invented sentence', bare.items[0])
  ok(/no full sentence exists to paste/.test(String(bare.items[0].requiredLineFullWhy || '')),
    '§1f ★ and the null says why, instead of contradicting its own `means`', bare.items[0])
  // a NON-truncated row keeps the field null on purpose and needs no explanation
  const short = quality.verifiedRequirements({
    view: { verified: () => ({ items: [{ id: 'rec-1', cardId: 'rec-c1', p: 1, title: '已验证｜n + n = 2n', warrant: 'w', source: 'debate' }] }), records: fakeRecords },
  })
  ok(short.items[0].requiredLineFull === null && short.items[0].requiredLineFullWhy === null,
    '§1g a line that was never capped keeps null + no why (the field only means "the rest of a capped line")', short.items[0])
})

test('RUN 199 §2 — advance names WHO REFUSED apart from WHO WAS NEVER COUNTED', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run199-'))
  try {
    const { call } = await assemble(dir)
    await call('vibe_v5_start', { researcherCount: 2 })
    const card = await call('vibe_v5_record_proposition', { id: 'rec-e199', title: '证据卡', statement: 'n + n = 2n', value: 0.9, motive: '算术', p: 0.9, member: 'r-acad' })
    ok(card.ok === true, '§2a premise: the evidence card is written', card)
    await call('vibe_v5_paper', { action: 'start', target: 'p-199', participants: ['r-1', 'r-2'] })
    for (const m of ['r-1', 'r-2']) {
      const p = await call('vibe_v5_paper', { action: 'part', target: 'p-199', member: m, part: m + ' 的部分', body: m + ' 的解法', evidence: ['rec-e199'] })
      ok(p.ok === true, '§2b premise: ' + m + ' wrote its part', p)
    }
    const toReview = advanceOf(await call('vibe_v5_paper', { action: 'advance', target: 'p-199' }))
    ok(toReview.ok === true && toReview.to === 'reviewing', '§2c premise: the paper is in review round 1', toReview)
    for (const m of ['r-1', 'r-2']) {
      const v = await call('vibe_v5_paper', { action: 'review', target: 'p-199', member: m, deliverable: true, comments: '可交付' })
      ok(v.ok === true, '§2d premise: ' + m + ' reviewed', v)
    }
    const round1 = advanceOf(await call('vibe_v5_paper', { action: 'advance', target: 'p-199' }))
    ok(round1.ok === true && round1.unanimous === true && round1.to === 'awaiting-editor',
      '§2e round 1 is unanimous and the paper goes to its editor', round1)
    ok(Array.isArray(round1.refusers) && round1.refusers.length === 0 && Array.isArray(round1.stale) && round1.stale.length === 0,
      '§2f the unanimous receipt names all three lists (two empty here)', round1)
    // ★ ROUND 2 exists only through the editor: final{revise} sends the paper back to writing (advance never returns to writing).
    const back2 = await call('vibe_v5_paper', { action: 'final', target: 'p-199', member: 'r-acad', decision: 'revise', note: '第二轮打磨' })
    ok(back2.ok === true, '§2g premise: the editor sent the paper back for a second round', back2.code || back2.ok)
    const reopened = await call('vibe_v5_paper', { action: 'advance', target: 'p-199' })   // writing → reviewing (round 2)
    ok(reopened.ok === true, '§2h premise: round 2 opened', reopened.code || reopened.ok)
    // ★ run 39's shape: nobody has filed a round-2 review yet, and every newest durable row belongs to round 1
    const held = advanceOf(await call('vibe_v5_paper', { action: 'advance', target: 'p-199' }))
    // ★★★ TB-2761（RUN 81 D-1）：round 变了但被判正文没变 ⇒ 旧票仍然计数。run 39 现场（round 2 没有任何新评审行）
    // 因此是 UNANIMOUS，不是「两人 stale + 退回 writing」。旧断言断的正是被 TB-2761 取代的 round 代理语义。
    ok(held.ok === true && held.unanimous === true && held.to === 'awaiting-editor',
      '§2i（TB-2761）跨轮但正文未变的两张票仍计数 ⇒ round 2 unanimous、推进 awaiting-editor', { unanimous: held.unanimous, to: held.to })
    ok(Array.isArray(held.refusers) && held.refusers.length === 0,
      '§2j 没有拒收（两张票都是 deliverable:true，且判的正文未变）', held)
    ok(Array.isArray(held.stale) && held.stale.length === 0,
      '§2k（TB-2761）没有因轮次作废的票：stale 为空且显式', held)
    ok(Array.isArray(held.notYetReviewed) && held.notYetReviewed.length === 0,
      '§2l 「一条行都没有」的列表也为空（他们都有行，只是写在 round 1）', held)
    ok(/ON PURPOSE/.test(String(held.refusersMeans || '')), '§2m 空列表是刻意说明的，不是留白', held)
    const cov199 = held.perRoundReviewCoverage
    ok(cov199 && Array.isArray(cov199.covered) && cov199.covered.length === 2 && cov199.missing.length === 0 && Array.isArray(cov199.voidReviews) && cov199.voidReviews.length === 0,
      '§2n（TB-2761）读数：covered 两席、missing 空、voidReviews 空（没有票因为轮次被作废）', cov199 && { covered: cov199.covered, missing: cov199.missing, voidReviews: cov199.voidReviews })
    const back = await call('vibe_v5_paper', { action: 'status', target: 'p-199' })
    ok(back.ok === true && back.paper && back.paper.stage === 'awaiting-editor',
      '§2o（TB-2761）论文真的走到 awaiting-editor（新语义没有把它退回 writing）', back.paper && back.paper.stage)
    // ★ TB-2761 反灯：整树副本把指纹绑定退回 round 绑定 ⇒ 同一场景必须退回「两人 stale、退回 writing」的旧事实。
    {
      const lampDir = mkdtempSync(join(tmpdir(), 'run199-lamp-'))
      try {
        cpSync(join(ROOT, 'vibe-math-vmu'), join(lampDir, 'vibe-math-vmu'), { recursive: true })
        const kitPath = join(lampDir, 'vibe-math-vmu', 'kit', 'paper.js')
        let mut = readFileSync(kitPath, 'utf8')
        const p1 = "if (judged.partChanged) return out(false, 'part-text-changed')"
        const p2 = 'if (crossEarlier && judgedEarlier.bound === true && !judgedEarlier.partChanged) {'
        ok(mut.indexOf(p1) !== -1 && mut.indexOf(p2) !== -1, '§2 lamp-setup：两个 mutation 点都在')
        mut = mut.replace(p1, "if (rowRound !== round) return out(false, 'part-text-changed')").replace(p2, 'if (false) {')
        writeFileSync(kitPath, mut)
        const lampRoot = mkdtempSync(join(tmpdir(), 'run199-lamp-ws-'))
        const L = await assemble(lampRoot, {}, pathToFileURL(join(lampDir, 'vibe-math-vmu', 'vibe-math-vmu.js')).href + '?lamp=1')
        const lampCall = L.call
        await lampCall('vibe_v5_start', { researcherCount: 2 })
        const lc = await lampCall('vibe_v5_record_proposition', { id: 'rec-lamp199', title: '证据卡', statement: 'n + n = 2n', value: 0.9, motive: '算术', p: 0.9, member: 'r-acad' })
        await lampCall('vibe_v5_paper', { action: 'start', target: 'p-lamp', participants: ['r-1', 'r-2'] })
        for (const m of ['r-1', 'r-2']) await lampCall('vibe_v5_paper', { action: 'part', target: 'p-lamp', member: m, part: m, body: m + ' body', evidence: ['rec-lamp199'] })
        await lampCall('vibe_v5_paper', { action: 'advance', target: 'p-lamp' })
        for (const m of ['r-1', 'r-2']) await lampCall('vibe_v5_paper', { action: 'review', target: 'p-lamp', member: m, deliverable: true, comments: 'ok' })
        await lampCall('vibe_v5_paper', { action: 'advance', target: 'p-lamp' })
        await lampCall('vibe_v5_paper', { action: 'final', target: 'p-lamp', member: 'r-acad', decision: 'revise', note: 'lamp' })
        await lampCall('vibe_v5_paper', { action: 'advance', target: 'p-lamp' })
        const lampHeld = advanceOf(await lampCall('vibe_v5_paper', { action: 'advance', target: 'p-lamp' }))
        ok(lampHeld && lampHeld.to === 'writing' && Array.isArray(lampHeld.stale) && lampHeld.stale.length === 2,
          '§2 lamp RED-worthy：退回 round 绑定 ⇒ 两张跨轮票又成 stale、论文退回 writing（run 39/81 的旧代理语义）', lampHeld && { to: lampHeld.to, stale: lampHeld.stale })
        rmSync(lampRoot, { recursive: true, force: true })
      } finally { rmSync(lampDir, { recursive: true, force: true }) }
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 199 §3 — a finalisation with only a note records that note as the conclusion, and says so', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run199-'))
  try {
    const { call } = await assemble(dir, { vmu: { 'vmu.paper.officeConsult': 'off' } })
    await call('vibe_v5_start', { researcherCount: 2 })
    const card = await call('vibe_v5_record_proposition', { id: 'rec-e200', title: '证据卡', statement: 'n + n = 2n', value: 0.9, motive: '算术', p: 0.9, member: 'r-acad' })
    ok(card.ok === true, '§3a premise: the evidence card is written', card)
    await call('vibe_v5_paper', { action: 'start', target: 'p-200', participants: ['r-1', 'r-2'] })
    for (const m of ['r-1', 'r-2']) await call('vibe_v5_paper', { action: 'part', target: 'p-200', member: m, part: m + ' 的部分', body: m + ' 的解法', evidence: ['rec-e200'] })
    await call('vibe_v5_paper', { action: 'advance', target: 'p-200' })
    for (const m of ['r-1', 'r-2']) await call('vibe_v5_paper', { action: 'review', target: 'p-200', member: m, deliverable: true, comments: '可交付' })
    const moved = advanceOf(await call('vibe_v5_paper', { action: 'advance', target: 'p-200' }))
    ok(moved.ok === true && moved.to === 'awaiting-editor', '§3b premise: the paper awaits its editor', moved)
    const note = '本稿的结论：前 n 个奇数之和等于 n²（由奇数累加恒等式直接推出）。'
    const finOuter = await call('vibe_v5_paper', { action: 'final', target: 'p-200', member: 'r-acad', decision: 'deliverable', note })
    // ★ TWO NESTING LAYERS, measured the hard way: the tool wraps its action under its own name ({ok, tool, action,
    // final: <block>}), and the block carries the decision itself under `final`. Reading one layer short is how a
    // receipt field "disappears" — this suite asserted `fin.final.conclusion` and got undefined for exactly that reason.
    const finBlock = finOuter && finOuter.final ? finOuter.final : finOuter
    const fin = finBlock && finBlock.final ? finBlock.final : finBlock
    // the receipt shape is the same whether the PDF compiled, was absent, or was rolled back — `final` is the decision
    ok(finOuter.ok === true && finBlock && finBlock.final, '§3c the finalisation answers with its `final` block', Object.keys(finOuter || {}))
    ok(fin.conclusion === note, '§3d ★★ the note IS the recorded conclusion (run 39 read conclusion:"")', { conclusion: fin.conclusion, source: fin.conclusionSource })
    ok(fin.conclusionSource === 'note', '§3e ★ and the receipt says the conclusion came from the note', fin.conclusionSource)
    ok(/not synonyms/.test(String(fin.conclusionMeans || '')), '§3f with the sentence that a note and a conclusion are not the same field', fin.conclusionMeans)
    // a caller who DOES pass a conclusion keeps it, and the provenance flips
    const dir2 = mkdtempSync(join(tmpdir(), 'vmu-run199b-'))
    try {
      const second = await assemble(dir2, { vmu: { 'vmu.paper.officeConsult': 'off' } })
      await second.call('vibe_v5_start', { researcherCount: 2 })
      await second.call('vibe_v5_record_proposition', { id: 'rec-e201', title: '证据卡', statement: 'n + n = 2n', value: 0.9, motive: '算术', p: 0.9, member: 'r-acad' })
      await second.call('vibe_v5_paper', { action: 'start', target: 'p-201', participants: ['r-1', 'r-2'] })
      for (const m of ['r-1', 'r-2']) await second.call('vibe_v5_paper', { action: 'part', target: 'p-201', member: m, part: m + ' 的部分', body: m + ' 的解法', evidence: ['rec-e201'] })
      await second.call('vibe_v5_paper', { action: 'advance', target: 'p-201' })
      for (const m of ['r-1', 'r-2']) await second.call('vibe_v5_paper', { action: 'review', target: 'p-201', member: m, deliverable: true, comments: '可交付' })
      await second.call('vibe_v5_paper', { action: 'advance', target: 'p-201' })
      const fin2Outer = await second.call('vibe_v5_paper', { action: 'final', target: 'p-201', member: 'r-acad', decision: 'deliverable', note: '短笺', conclusion: '完整结论句。' })
      const fin2Block = fin2Outer && fin2Outer.final ? fin2Outer.final : fin2Outer
      const fin2 = fin2Block && fin2Block.final ? fin2Block.final : fin2Block
      ok(fin2Outer.ok === true && fin2.conclusion === '完整结论句。' && fin2.conclusionSource === 'conclusion',
        '§3g a passed conclusion is recorded verbatim and named as its own source — the fallback does not overwrite it', { c: fin2.conclusion, s: fin2.conclusionSource })
    } finally { rmSync(dir2, { recursive: true, force: true }) }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 199 §4 — convening a meeting with a subject refuses with a minimal call for THAT type', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run199-'))
  try {
    const { call } = await assemble(dir)
    await call('vibe_v5_start', { researcherCount: 2 })
    const closure = await call('vibe_v5_meeting', { member: 'r-acad', type: 'closure', subject: 'rec-e1', agenda: '结题', title: '结题会' })
    ok(closure.ok === false && closure.code === 'VMU_INVALID_ARGUMENT', '§4a a closure meeting takes no subject (refused by name)', closure)
    ok(/MINIMAL CALL for this type/.test(String(closure.hint || '')), '§4b ★ the hint hands back a minimal call', closure.hint)
    ok(/CLOSURE meeting takes an AGENDA and nothing else/.test(String(closure.hint || '')),
      '§4c ★★ and says that a closure meeting needs the AGENDA (run 39 forgot it)', closure.hint)
    ok(new RegExp('type:"closure"').test(String(closure.hint || '')), '§4d the call it prints is the one this caller wanted', closure.hint)
    const debate = await call('vibe_v5_meeting', { member: 'r-acad', type: 'debate', agenda: '裁决', title: '辩论会' })
    ok(debate.ok === false && /subject/.test(String(debate.hint || '')), '§4e a debate still demands its subject', debate)
    const ordinary = await call('vibe_v5_meeting', { member: 'r-acad', type: 'ordinary', subject: 'rec-e2', agenda: '例会', title: '例会' })
    ok(ordinary.ok === false && /an ordinary meeting takes an AGENDA and nothing else/.test(String(ordinary.hint || '')),
      '§4f an ordinary meeting gets its own sentence (the type is read, not assumed)', ordinary.hint)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 199 §5+§6 — the reply channel names itself, and a proof_ref write warns about the library root and the lock', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run199-'))
  try {
    const { call } = await assemble(dir)
    await call('vibe_v5_start', { researcherCount: 2 })
    // §5: op:"reply" IS the report channel; a `reply` string is the OTHER channel
    const both = await call('vibe_vmu_turn', { op: 'reply', report: { say: '我同意' }, reply: '我同意' })
    ok(both.ok === false && both.code === 'VMU_INVALID_ARGUMENT', '§5a the two-channel call is still refused', both)
    ok(/is the TOOL-REPORT channel/.test(String(both.message || '')),
      '§5b ★★ the message says what the op IS (run 39 read "carries BOTH a tool report" while passing none)', both.message)
    ok(/OTHER channel/.test(String(both.message || '')) && /op:"step", reply/.test(String(both.hint || '')),
      '§5c ★ and names the channel the string belongs to, with the correct shape in the hint', { m: both.message, h: both.hint })
    // §6: the proof_ref receipt carries the two facts run 39 learned the hard way
    const card = await call('vibe_v5_record_proposition', {
      id: 'rec-proof199', title: '奇数求和证明卡', statement: '前 n 个奇数之和等于 n²', value: 1, motive: '归纳', p: 0.9, member: 'r-acad',
      proof_ref: 'Members/r-acad/Propos/p-199.md#证明', proof_state: 'complete',
    })
    ok(card.ok === true, '§6a premise: the card is written with a self-reported proof_ref', card)
    const ev = card.proofStateEvidence
    ok(!!ev && ev.kind === 'proof-ref', '§6b the receipt reports the evidence kind it admitted', ev)
    ok(/NOT to your session working directory/.test(String(ev.pointerNote || '')),
      '§6c ★★ the pointer is named as relative to the LIBRARY root, not the working directory', ev && ev.pointerNote)
    // ★★★ RUN 212 (run 49 / FEEDBACK48 1.2) measured this sentence against the behaviour: the pointer this test names does
    // NOT exist (a fresh library root), and in that case the rule-L14 lock is DEFERRED — the card stays writable, so
    // "the pointer cannot be corrected afterwards" was false. The note now follows the fact: deferred here, LOCKED once a
    // pointer that really resolves has been registered.
    ok(/NOT locked/.test(String(ev.lockNote || '')) && /DEFERRED/.test(String(ev.lockNote || ''))
      && /correct the pointer freely/.test(String(ev.lockNote || '')),
      '§6d ★★★ a DANGLING pointer defers the lock, and the note says the pointer can still be corrected', ev && ev.lockNote)
    ok(!/cannot be corrected afterwards/.test(String(ev.lockNote || '')),
      '§6e ★★ the contradictory sentence is gone (it was printed while the card was still writable)', ev && ev.lockNote)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
