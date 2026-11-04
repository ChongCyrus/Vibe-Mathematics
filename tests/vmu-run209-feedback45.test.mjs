// RUN 209 — run 46 / FEEDBACK45: the live shape that slipped past a fix, and five sentences that answered
// a neighbouring question.
//
// 1.3  `review { deliverable:true, decision:false }` — RUN 208's guard only fired when `deliverable` was ABSENT.
//      The live call passes BOTH, so the boolean was dropped again and the next `advance` read unanimity.
// 1.1  `verdict_final` printed `correction.call` with `value: NaN` for a card whose value is TEXT — the one call
//      the receipt tells the holder to copy back, and its own `shapeMeans` called it accepted as printed.
// 1.2  `verdicts:[{"r-acad":1}]` (an array of objects KEYED BY MEMBER ID) was read as missing PEOPLE, not a shape.
// 2.2  `vibe_v5_start` answered `started.already:true` on an EMPTY roster; "already" is the KERNEL's word about its
//      middleware start, and nothing said so.
// 2.1  the mainline block promised the three seats share one verbatim body while appending a per-seat duty line.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const PACK = read('vibe-math-vmu/packs/v5r/tools.js')
const BLOCKS = read('vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)
const tmp = () => mkdtempSync(join(tmpdir(), 'vmu-run209-'))

async function assemble(dir) {
  const entry = await import(pathToFileURL(ENTRY).href)
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { async register(s) { specs.push(s); return () => {} } } }
  const handle = await entry.apply(ctx, { clock: () => 1793464774000, packs: ['v5r'], root: dir })
  await handle.ready()
  await handle.kernel.store.open()
  const call = async (name, args) => {
    const s = specs.filter((x) => x && x.name === name)[0]
    if (!s) throw new Error('no such face: ' + name)
    const raw = await s.execute(args, { kernel: handle.kernel })
    return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
  }
  return { call, handle, specs }
}

const blockOf = (r, key) => (r && r[key]) || r

test('RUN 209 §0 — the repairs live on the source they belong to (pins)', () => {
  // 1.3 — the guard no longer has the `deliverable`-absent precondition; that precondition WAS the bug.
  has(PACK, 'if (args.decision !== undefined && args.decision !== null) {', '§0a ★★★ review refuses `decision` at any combination (the precondition was the bug)')
  ok(!PACK.includes('(args.deliverable === undefined || args.deliverable === null) && args.decision !== undefined'),
    '§0b ★★★ …and the old "only when deliverable is absent" spelling is gone')
  // 1.1 — the value renderer never runs a text value through Number().
  has(PACK, 'const valueLiteral = (v) => {', '§0c ★★ correction.call has ONE value renderer')
  has(PACK, 'if (typeof v === \'number\' && Number.isFinite(v)) return String(v)', '§0d ★ numbers stay numbers')
  has(PACK, 'return quoted(v)', '§0e ★ anything else is quoted, so text parses back as the same text')
  ok(!PACK.includes('? String(Number(f.value))'), '§0f ★★ the NaN-producing spelling is gone')
  has(PACK, 'callMeans:', '§0g ★ the receipt says where each printed field came from')
  // 1.2 — row shape gate, before the missing-member arithmetic.
  has(PACK, 'const ROW_KEYS = [\'member\', \'p\', \'verdict\', \'reason\', \'why\', \'note\']', '§0h ★★ verdicts rows have a shape gate')
  has(PACK, 'an OBJECT KEYED BY MEMBER ID is not a row', '§0i ★★★ and it names the shape that arrived')
  // 2.2 — `already` is named as the KERNEL's word, and what THIS call hired is a separate field.
  has(PACK, 'started, startedMeans, applied', '§0j ★★ start says what `started.already` is about')
  has(PACK, 'hiredNow: hired.slice(), rosterBefore: rosterBefore.map((r) => r.id)', '§0k ★★ and what this call seeded, separately')
  // 2.1 — the mainline promise names what is shared and what is per-seat.
  has(BLOCKS, '**共享正文**＝本段这 4 条', '§0l ★★ the mainline block names the scope of "verbatim"')
  has(BLOCKS, '**按席位能力不同**', '§0m ★ and says the blueprint section is not part of it')
})

test('RUN 209 §1 — a review that says "decision" is refused even beside deliverable (the live shape)', async () => {
  const dir = tmp()
  try {
    const { call } = await assemble(dir)
    ok((await call('vibe_v5_start', { problem: 'RUN 209 的论文', researcherCount: 2 })).ok === true, 'premise: founded')
    ok((await call('vibe_v5_paper', { action: 'start', participants: ['r-1', 'r-2'], target: 'paper-209' })).ok === true, 'premise: paper started')
    ok((await call('vibe_v5_paper', { action: 'part', target: 'paper-209', member: 'r-1', part: '第一节', body: '归纳法证明：前 n 个奇数之和为 n²。' })).ok === true, 'premise: r-1 wrote a part')
    ok((await call('vibe_v5_paper', { action: 'part', target: 'paper-209', member: 'r-2', part: '第二节', body: '逐项核验：n=1..5 逐一相加与平方相符。' })).ok === true, 'premise: r-2 wrote a part')
    const moved = blockOf(await call('vibe_v5_paper', { action: 'advance', target: 'paper-209' }), 'advance')
    ok(moved.moved === true, 'premise: the paper moved to reviewing', moved)

    // ★★★ THE LIVE CALL from run 46: BOTH keys, the opposite of each other.
    const refused = await call('vibe_v5_paper', {
      action: 'review', target: 'paper-209', member: 'r-1', of: 'r-2', deliverable: true, decision: false, notes: '一致',
    })
    ok(refused.ok === false, '§1a ★★★ deliverable:true + decision:false is REFUSED (it used to return ok:true)', refused)
    ok(refused.code === 'VMU_INVALID_ARGUMENT', '§1b named code', refused.code)
    has(refused.message, 'this face does NOT read it', '§1c ★ the message says the word is not read here')
    has(refused.message, '`decision` belongs to `final`', '§1d ★ and where it does belong')
    ok(!('review' in refused) || refused.review === undefined, '§1e nothing was recorded', refused.review)

    // the honest call still works, and it does what a send-back must do
    const back = blockOf(await call('vibe_v5_paper', {
      action: 'review', target: 'paper-209', member: 'r-1', of: 'r-2', deliverable: false, notes: '第二节要补边界',
    }), 'review')
    ok(back.ok === true, '§1f premise: deliverable:false is accepted', back)
    const reopened = blockOf(await call('vibe_v5_paper', { action: 'advance', target: 'paper-209' }), 'advance')
    ok(reopened.to === 'writing', '§1g ★★ and the advance REOPENS writing (this is what the dropped word used to steal)', reopened)
    ok(Array.isArray(reopened.refusers) || reopened.unanimous !== true, '§1h ★ the paper is not read as unanimous', reopened)
  } finally { /* tmp dir left to the runner's hygiene */ }
})

test('RUN 209 §2 — a verdicts row keyed by member id is a SHAPE defect, not missing people', async () => {
  const dir = tmp()
  try {
    const { call } = await assemble(dir)
    ok((await call('vibe_v5_start', { problem: 'RUN 209 的裁决', researcherCount: 2 })).ok === true, 'premise: founded')
    const card = await call('vibe_v5_record_proposition', {
      statement: '前 n 个奇数之和等于 n 的平方', value: '对 n≥1 成立', motive: '初等结论', p: 0.9, member: 'r-1',
    })
    ok(card.ok === true, 'premise: the card exists', card)
    const mid = 'm1'
    ok((await call('vibe_v5_meeting', { member: 'r-acad', agenda: '就 rec-1 辩论', title: 'm-deb' })).ok === true, 'premise: meeting')
    ok((await call('vibe_vmu_meeting', { action: 'attend', id: mid, member: 'r-acad' })).ok === true, 'premise: chair attended')

    // ★★★ THE LIVE CALL from run 46: an ARRAY of an object KEYED BY MEMBER ID.
    const refused = await call('vibe_v5_verdict_final', {
      meeting: mid, member: 'r-acad', proposition_id: String(card.recordId), verdicts: [{ 'r-acad': 1 }],
    })
    ok(refused.ok === false, '§2a ★★★ the keyed row is refused', refused)
    ok(refused.code === 'VMU_INVALID_ARGUMENT', '§2b ★ named code (it used to be VMU_STATE "missing members")', refused.code)
    has(refused.message, 'OBJECT KEYED BY MEMBER ID', '§2c ★★★ the message names the shape that arrived')
    has(refused.message, 'verdicts[0]', '§2d ★ and which row')
    ok(!String(refused.message).includes('member(s) who debated'), '§2e ★★ it no longer talks about missing PEOPLE', refused.message)

    // the honest shape works
    const fin = await call('vibe_v5_verdict_final', {
      meeting: mid, member: 'r-acad', proposition_id: String(card.recordId),
      verdicts: [
        { member: 'r-acad', p: 1, reason: '归纳法' },
        { member: 'r-1', p: 1, reason: '逐项核验' },
        { member: 'r-2', p: 1, reason: '归纳法+边界' },
      ],
    })
    ok(fin.ok === true, '§2f premise: the proper rows are accepted', fin)
  } finally { /* hygiene */ }
})

test('RUN 209 §3 — the call the receipt tells you to copy keeps the value the card holds', async () => {
  const dir = tmp()
  try {
    const { call } = await assemble(dir)
    ok((await call('vibe_v5_start', { problem: 'RUN 209 的定概率', researcherCount: 2 })).ok === true, 'premise: founded')
    const textCard = await call('vibe_v5_record_proposition', {
      statement: '前 n 个奇数之和等于 n 的平方', value: '对 n≥1 成立', motive: '初等结论', p: 0.9, member: 'r-1',
    })
    ok(textCard.ok === true, 'premise: a card whose `value` is TEXT', textCard)
    ok((await call('vibe_v5_meeting', { member: 'r-acad', agenda: '就 rec-1 辩论', title: 'm-deb' })).ok === true, 'premise: meeting')
    ok((await call('vibe_vmu_meeting', { action: 'attend', id: 'm1', member: 'r-acad' })).ok === true, 'premise: chair attended')
    const fin = await call('vibe_v5_verdict_final', {
      meeting: 'm1', member: 'r-acad', proposition_id: String(textCard.recordId),
      verdicts: [
        { member: 'r-acad', p: 1, reason: '归纳法' },
        { member: 'r-1', p: 1, reason: '逐项核验' },
        { member: 'r-2', p: 1, reason: '归纳法+边界' },
      ],
    })
    ok(fin.ok === true, 'premise: the ruling was taken', fin)
    const correction = fin.correction || {}
    const callText = String(correction.call || '')
    ok(callText.length > 0, '§3a the receipt still prints a copyable call', correction)
    ok(!callText.includes('NaN'), '§3b ★★★ the printed call does NOT carry NaN (run 46 measured `value: NaN`)', callText)
    has(callText, 'value: "对 n≥1 成立"', '§3c ★★★ the card\'s TEXT value is printed as quoted text')
    has(String(correction.callMeans), 'carried from the CARD', '§3d ★ the receipt says where the fields came from')

    // a NUMERIC card must still print a bare number (the other half of the same renderer)
    const numCard = await call('vibe_v5_record_proposition', {
      statement: '3 是奇数', value: 3, motive: '算术', p: 0.8, member: 'r-2',
    })
    ok(numCard.ok === true, 'premise: a card whose `value` is a NUMBER', numCard)
    ok((await call('vibe_v5_meeting', { member: 'r-acad', agenda: '就 rec-2 辩论', title: 'm-deb2' })).ok === true, 'premise: second meeting')
    ok((await call('vibe_vmu_meeting', { action: 'attend', id: 'm2', member: 'r-acad' })).ok === true, 'premise: chair attended again')
    const fin2 = await call('vibe_v5_verdict_final', {
      meeting: 'm2', member: 'r-acad', proposition_id: String(numCard.recordId),
      verdicts: [
        { member: 'r-acad', p: 1, reason: '算术' },
        { member: 'r-1', p: 1, reason: '算术' },
        { member: 'r-2', p: 1, reason: '算术' },
      ],
    })
    ok(fin2.ok === true, 'premise: the second ruling was taken', fin2)
    has(String(fin2.correction && fin2.correction.call), 'value: 3', '§3e ★ a numeric value still prints as a number')
  } finally { /* hygiene */ }
})

test('RUN 209 §4 — "already" is the kernel\'s word, and what this call seeded is said separately', async () => {
  const dir = tmp()
  try {
    const { call } = await assemble(dir)
    const started = await call('vibe_v5_start', { problem: 'RUN 209 的立所', researcherCount: 2 })
    ok(started.ok === true, 'premise: founded', started)
    ok(Array.isArray(started.hiredNow) && started.hiredNow.length === 3, '§4a ★ hiredNow names the seats THIS call made', started.hiredNow)
    ok(Array.isArray(started.rosterBefore) && started.rosterBefore.length === 0, '§4b ★★ rosterBefore is EMPTY — the institute really was fresh', started.rosterBefore)
    // ★ RUN 221 (run 57 / FEEDBACK56 1.5): the kernel's word is now PROJECTED under a name that carries its subject —
    // `already` on a first founding read as "the institute already existed", which this same receipt denied elsewhere.
    ok(started.started && started.started.middlewareAlreadyRegistered === true,
      '§4c premise: the kernel did answer that its middleware start had run (the projection names the subject)', started.started)
    ok(started.startedRaw && started.startedRaw.already === true,
      "§4c-2 the kernel's OWN answer still travels, under a key that says it is raw", started.startedRaw)
    ok(!('already' in started.started),
      '§4c-3 the projected block does NOT expose the bare word a reader mis-took for "the institute already existed"', started.started)
    has(started.startedMeans, 'KERNEL', '§4d ★★★ the receipt says whose word `already` is')
    has(started.startedMeans, 'NOT a statement that the institute existed before', '§4e ★★ …and explicitly denies the reading run 46 reported')
  } finally { /* hygiene */ }
})

test('RUN 209 §5 — the mainline block says what is verbatim and what is per seat', async () => {
  const mod = await import(pathToFileURL(join(ROOT, 'vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js')).href)
  const block = mod.CHARTER_BLOCKS_B.filter((b) => b && b.name === 'v5r-turn-mainline')[0]
  ok(block !== undefined, '§5a premise: the mainline block exists')
  const acad = String(block.texts.academician || '')
  const res = String(block.texts.researcher || '')
  const tempS = String(block.texts.temp || '')
  ok(acad !== res && res !== tempS, '§5b premise: the three seats DO differ (that is why the promise had to change)')
  has(acad, '**共享正文**＝本段这 4 条', '§5c ★★ the shared part is named')
  has(acad, '**按席不同**', '§5d ★ the duty line is named as per-seat')
  // the shared body itself must be byte-identical across seats: strip the duty line (the last line) and compare
  const bodyOf = (t) => t.split('\n').slice(0, -1).join('\n')
  ok(bodyOf(acad) === bodyOf(res) && bodyOf(res) === bodyOf(tempS),
    '§5e ★★★ the 4 shared lines ARE byte-identical across the three seats', { acad: bodyOf(acad).length, res: bodyOf(res).length })
  ok(acad.includes('【核心推进方向（主线）】') && res.includes('【核心推进方向（主线）】') && tempS.includes('【核心推进方向（主线）】'),
    '§5f every seat carries the mainline section')
})
