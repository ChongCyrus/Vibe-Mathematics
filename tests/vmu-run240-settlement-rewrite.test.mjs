// tests/vmu-run240-settlement-rewrite.test.mjs — RUN 240 / FEEDBACK63 1.2 (live run 63, MEASURED):
//
// THE DEFECT CLASS THIS PINS: 「不许静默抹掉结算」 protected the LINES of a settled card but not the READING. Run 63
// settled a card (p=1 plus a `- debateRuling：` row), then re-wrote it with `bodyMode:"merge"` and `p:0.95`: the ruling
// row survived, the receipt honestly said `ok:true, settled:false`, and the card was quietly undecided again — because
// a merge CHANGES the value of the `p` line instead of deleting it, so the destructive-write guard never saw it.
//
// WHAT IS PINNED HERE (every "it worked" is read back from the kernel, not inferred from a receipt):
//   §1 a merge that MOVES the probability off a settled reading is REFUSED BY NAME (`VMU_RECORD_SETTLEMENT_REWRITE`),
//      and the refusal names the three reachable paths (settle with the ruling / keep the same p / confirmDestructive);
//   §2 the second half of the same defect: `p` is a REQUIRED parameter, so a text correction had to send p=1 again and
//      was refused by the p=1 evidence gate (`VMU_PACK_V5R_P1_NEEDS_DEBATE`) — measured on run 63. A write that leaves
//      the probability EXACTLY where the card already had it declares nothing new, so it is admitted and says why
//      (`p1GateSkipped:"p-unchanged"`);
//   §3 the guard is not a blanket weakening: a NEW p=1 card still needs its evidence, and an unsettled card is still
//      freely re-estimated;
//   §4 withdrawing a settled reading stays possible, but only by SAYING SO (`confirmDestructive:true`), and the receipt
//      then says the card is no longer settled.
//
// RULE E: every loop/`every()` is preceded by an explicit NON-EMPTY assertion.
// Run: node tests/vmu-run240-settlement-rewrite.test.mjs   Last line: === VMU RUN 240 SETTLEMENT REWRITE: N passed, M failed ===
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const TOOLS_SRC = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
// The simulator IS the deployment seam here (`scripts/sim/harness.mjs` boots the real entry with `packs:['v5r']`, opens
// the store, and hands back the same `call`/`records` the scenario corpus is built on) — so this suite cannot drift from
// what a scenario or a live turn sees.
const { boot } = await import(pathToFileURL(join(REPO, 'scripts', 'sim', 'harness.mjs')).href)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const src = await readFile(TOOLS_SRC, 'utf8')

// ── 0. THE MECHANISM EXISTS IN THE SOURCE AT ALL ─────────────────────────────────────────────────────────────
console.log('=== 0. SOURCE PINS: the guard, the exemption, and the receipt words are all present ===')
ok(src.includes('VMU_RECORD_SETTLEMENT_REWRITE'), '★★ 正：新拒绝码 VMU_RECORD_SETTLEMENT_REWRITE 在写卡面里存在')
ok(/const wasSettled = hadRulingLine && prevProj !== null && \(prevProj\.p === 1 \|\| prevProj\.p === 0\)/.test(src),
  '★★ 正：守卫判定「已结算」= 有 debateRuling 行 且 p 为 0/1（同时读行与读数，不只读其一）')
ok(/args\.confirmDestructive !== true/.test(src), '★★ 正：守卫给 confirmDestructive 留了具名出口（不是死墙）')
ok(src.includes("p1GateSkipped: 'p-unchanged'"), '★★ 正：p 不变时门被跳过并具名（p1GateSkipped）')
ok(/const pUnchanged = storedP !== null && typeof args\.p === 'number' && Number\(args\.p\) === storedP/.test(src),
  '★★ 正：pUnchanged 读的是「这次写的 p」与「卡上已有的 p」相等（不是缺省为真）')
ok(src.includes('declares nothing new') && src.includes('guards a change of the reading, not a correction of the text beside it'),
  '★★ 正：跳过门时回执说明了为什么可以跳过')

const root = await mkdtemp(join('D:/_tmp', 'vmu-run240-settle-'))
try {
  const h = await boot({ root, clock: () => 1_800_000_000_000, withPrompt: false })
  const kernel = h.kernel
  const CHAIR = 'r-acad'
  const M1 = 'r-1'
  const M2 = 'r-2'
  await kernel.members.hire({ id: CHAIR, slot: 'chair' })
  await kernel.members.hire({ id: M1, slot: 'member' })
  await kernel.members.hire({ id: M2, slot: 'member' })
  const roster = kernel.members.roster().map((m) => m.id)
  ok(roster.length >= 3, '前置(RULE E)：三个真实成员在位', roster)

  const asMember = (id) => ({ as: { agent: { id } } })
  const card = (args, who = M1) => h.call('vibe_v5_record_proposition', args, asMember(who))
  const bodyOf = (id) => String(h.records.get({ id }).body === undefined ? '' : h.records.get({ id }).body)

  // ── 1. A MERGE THAT MOVES THE PROBABILITY OFF A SETTLED READING IS REFUSED BY NAME ─────────────────────────
  console.log('=== 1. un-settling in silence is refused by name, with the reachable paths in the receipt ===')
  // The bridge above only works for already-settled promises; the harness call is a real async round-trip, so the fixture
  // is built with plain awaits here instead of the helper.
  const built = await card({ id: 'c-settled', title: 'c-settled', statement: 'c-settled 的陈述', value: '0.9', motive: '测试', p: 0.9 })
  ok(built && built.ok === true, '前置(RULE E)：c-settled 真的被创建', built && (built.code || built.ok))
  const settledBody = bodyOf('c-settled').split('\n')
    .map((line) => (/^- *p *[：:]/.test(line) ? '- p：1' : line))
    .join('\n') + '\n- debateRuling：{"value":1,"mode":"unanimous","n":3,"decided":true,"meeting":"m1"}'
  kernel.records.supersede({ id: 'c-settled', reason: 'test fixture: stand in for a ruling settlement', by: CHAIR, body: settledBody })
  const settledNow = bodyOf('c-settled')
  ok(/^- *p *[：:] *1\b/m.test(settledNow), '前置(RULE E)：卡体真的带 `- p：1`', settledNow.split('\n').filter((l) => /p *[：:]/.test(l)))
  ok(/^- *debateRuling *[：:]/m.test(settledNow), '前置(RULE E)：卡体真的带 debateRuling 行', settledNow.includes('debateRuling'))

  const attemptedUnsettle = await card({ id: 'c-settled', title: 'c-settled', statement: 'c-settled 的陈述', value: '0.91', motive: '测试', p: 0.95, bodyMode: 'merge' })
  ok(attemptedUnsettle && attemptedUnsettle.ok === false, '★★ 正(1.2)：已结算卡上 merge + p=0.95 被拒（不是 ok:true,settled:false）', attemptedUnsettle && (attemptedUnsettle.code || attemptedUnsettle.ok))
  ok(attemptedUnsettle && attemptedUnsettle.code === 'VMU_RECORD_SETTLEMENT_REWRITE', '★★ 正(1.2)：拒绝码是 VMU_RECORD_SETTLEMENT_REWRITE', attemptedUnsettle && attemptedUnsettle.code)
  const unsettleMsg = String((attemptedUnsettle && attemptedUnsettle.message) || '')
  const unsettleHint = String((attemptedUnsettle && attemptedUnsettle.hint) || '')
  ok(unsettleMsg.includes('SETTLED') && unsettleMsg.includes('p=1') && unsettleMsg.includes('0.95'), '正(1.2)：message 同时说出当前读数与这次要写的读数', unsettleMsg.slice(0, 90))
  ok(unsettleHint.includes('debate_ruling') && unsettleHint.includes('confirmDestructive') && unsettleHint.includes('REQUIRED parameter'),
    '★★ 正(1.2)：hint 给三条可达路径（带裁决重结算 / 保持同一个 p / confirmDestructive 且 p 是必填不能省）', unsettleHint.slice(0, 130))
  const afterRefusal = bodyOf('c-settled')
  ok(/^- *p *[：:] *1\b/m.test(afterRefusal), '★★ 正(1.2)：被拒之后卡上仍然是 p=1（拒绝没有半写）', afterRefusal.split('\n').filter((l) => /p *[：:]/.test(l)))
  ok(!afterRefusal.includes('0.91'), '★★ 正(1.2)：被拒的写入连 value 都没落下（整次拒绝，不是部分写）', afterRefusal.split('\n').filter((l) => /value/.test(l)))

  // ── 2. A TEXT CORRECTION THAT KEEPS THE READING IS ADMITTED, AND SAYS WHY ───────────────────────────────────
  console.log('=== 2. the same p is not a new claim: a text correction is admitted and named ===')
  const textFix = await card({ id: 'c-settled', title: 'c-settled', statement: 'c-settled 的陈述（修订）', value: '0.92', motive: '测试（修订）', p: 1, bodyMode: 'merge' })
  ok(textFix && textFix.ok === true, '★★ 正(1.2b)：保留 p=1 的文字订正被接受（此前被 p=1 证据门拒）', textFix && (textFix.code || textFix.ok))
  ok(textFix && textFix.p1GateSkipped === 'p-unchanged', '★★ 正(1.2b)：回执具名 p1GateSkipped:"p-unchanged"', textFix && textFix.p1GateSkipped)
  ok(String((textFix && textFix.p1GateSkippedMeans) || '').includes('guards a change of the reading'),
    '★★ 正(1.2b)：并说明「门守的是读数变化，不是旁边的文字」', String((textFix && textFix.p1GateSkippedMeans) || '').slice(0, 90))
  const afterTextFix = bodyOf('c-settled')
  ok(afterTextFix.includes('（修订）'), '★★ 正(1.2b)：文字真的写进去了（读回卡体，不只看回执）', afterTextFix.split('\n')[1])
  ok(/^- *debateRuling *[：:]/m.test(afterTextFix), '★★ 正(1.2b)：结算行仍在（merge 没有抹掉它）', afterTextFix.includes('debateRuling'))
  ok(/^- *p *[：:] *1\b/m.test(afterTextFix), '★★ 正(1.2b)：读数仍然是 1（订正没有改它）', afterTextFix.split('\n').filter((l) => /p *[：:]/.test(l)))

  // ── 3. THE GUARD IS NOT A BLANKET WEAKENING ─────────────────────────────────────────────────────────────────
  console.log('=== 3. controls: a new p=1 still needs evidence, an unsettled card is still re-estimated freely ===')
  const newP1 = await card({ id: 'c-new', title: 'c-new', statement: 'c-new 的陈述', value: '1', motive: '测试', p: 1 })
  ok(newP1 && newP1.ok === false && newP1.code === 'VMU_PACK_V5R_P1_NEEDS_DEBATE',
    '★★ 反：一张 NEW 卡的 p=1 仍然需要定论证据（守卫没有把 p=1 门废掉）', newP1 && (newP1.code || newP1.ok))
  const madeOpen = await card({ id: 'c-open', title: 'c-open', statement: 'c-open 的陈述', value: '0.5', motive: '测试', p: 0.5 })
  ok(madeOpen && madeOpen.ok === true, '前置(RULE E)：c-open 是一张未结算卡', madeOpen && (madeOpen.code || madeOpen.ok))
  const reEstimate = await card({ id: 'c-open', title: 'c-open', statement: 'c-open 的陈述', value: '0.5', motive: '测试', p: 0.75, bodyMode: 'merge' })
  ok(reEstimate && reEstimate.ok === true, '★★ 反：未结算卡改估计值仍然自由（守卫只管「已结算读数被悄悄改掉」）', reEstimate && (reEstimate.code || reEstimate.ok))
  ok(reEstimate && reEstimate.p1GateSkipped === undefined, '★★ 反：未结算卡的重估不带 p1GateSkipped（那个标记只在 p 未变时出现）', reEstimate && reEstimate.p1GateSkipped)

  // ── 4. WITHDRAWING A SETTLED READING IS A NAMED INTENT ──────────────────────────────────────────────────────
  console.log('=== 4. withdrawing a settled reading is possible, but only by naming it ===')
  const withdrawn = await card({ id: 'c-settled', title: 'c-settled', statement: 'c-settled 的陈述（修订）', value: '0.92', motive: '测试（修订）', p: 0.95, bodyMode: 'merge', confirmDestructive: true })
  ok(withdrawn && withdrawn.ok === true, '★★ 正(1.2c)：confirmDestructive:true 时允许撤回结算读数', withdrawn && (withdrawn.code || withdrawn.ok))
  ok(withdrawn && withdrawn.settled === false, '★★ 正(1.2c)：回执如实说这张卡不再结算（settled:false）', withdrawn && withdrawn.settled)
  const afterWithdraw = bodyOf('c-settled')
  ok(/^- *p *[：:] *0\.95$/m.test(afterWithdraw), '★★ 正(1.2c)：读回卡体 p 真的变成 0.95', afterWithdraw.split('\n').filter((l) => /p *[：:]/.test(l)))
} finally {
  await rm(root, { recursive: true, force: true }).catch(() => {})
}

console.log('')
console.log('=== VMU RUN 240 SETTLEMENT REWRITE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.error('FAILURES: ' + JSON.stringify(failures, null, 2)); process.exit(1) }
