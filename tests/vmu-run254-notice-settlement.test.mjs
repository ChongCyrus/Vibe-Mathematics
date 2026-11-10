// tests/vmu-run254-notice-settlement.test.mjs — RUN 254-B: the notice block has ONE settlement criterion, the
// simulator renders the SAME block as a real turn, and a bad delivery SHAPE is not turned into prose.
//
// WHY THIS SUITE EXISTS (three measured defects, one theme: an instrument that does not show what the machine did):
//
//   P1-1 — THE BLOCK CONTRADICTED ITSELF. Every rendered line ended with `读后 mailbox ack <id>`, but for an ORDINARY
//          mail `open()` (reading the body) silently dropped the line on the next turn, while a delivery row stayed
//          until acked. Two criteria in one block: a member who read and followed the wording looked for an ack that
//          was never needed. `kernel/mailbox.js` now has ONE criterion — a row is DELIVERED UNTIL IT IS ACKED — and the
//          receipt names it (`acked` / `ackRequired` / `unackedRows` / `settledBy`). This suite proves it with TWO REAL
//          TURNS: after `open` (read:true) the next turn STILL shows the same line; only `ack` makes it disappear.
//
//   P1-5 — THE SIMULATOR DID NOT RENDER THE BLOCK AT ALL. `scripts/sim/harness.mjs` built its own turn loop without
//          `noticeBlock`/`noticeSource`, so a seat with un-acked mail measured a prompt a real member never reads
//          (the RUN 226/244 ruler defect again). It now wires the SAME producer as the entry (pack block wins, kernel
//          block is the fallback; Lean notices then mailbox lines). The assertion here is same-source: the simulated
//          block and the REAL turn prompt block are byte-identical for the same inbox state — no hand-written text.
//
//   P1-6 — THE SIMULATOR MANUFACTURED A REPLY OUT OF A SHAPE DEFECT. A scenario that returned a host delivery envelope
//          (`{output:[{type:'text',…}]}`) was flattened by `String(reply)` into `"[object Object]"`, i.e. 15 characters
//          of prose the kernel happily parsed, so the defect never reached the boundary that can name it. The harness
//          now passes unrecognised objects through as a named marker (never `String(obj)`), and the kernel door
//          (`VMU_TURN_DELIVERY_SHAPE`) is proved reachable by driving the same shape through a raw delivery seam.
//
// Run: node tests/vmu-run254-notice-settlement.test.mjs   (targeted only)
import { mkdirSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const HARNESS = await import(pathToFileURL(join(REPO, 'scripts', 'sim', 'harness.mjs')).href)
const { createTurnOrchestrator } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')).href)
const { createPromptPipeline } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'prompt', 'index.js')).href)

const MAILBOX_SRC = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'mailbox.js'), 'utf8')
const HARNESS_SRC = readFileSync(join(REPO, 'scripts', 'sim', 'harness.mjs'), 'utf8')
const TURN_SRC = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js'), 'utf8')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1
  failures.push(label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 500)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 500)))
  return false
}
const NL = String.fromCharCode(10)
const FENCE = '```'
const fence = (payload) => [FENCE + 'json', JSON.stringify(payload), FENCE].join(NL)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const waitFor = async (pred, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (pred()) return true; await sleep(5) } return !!pred() }

// The block is PREPENDED by the turn loop, so the one this suite compares is the text from index 0 to the first blank
// line. (`[新到的消息]` also appears later in the charter prose that explains the block — a `includes` check would be
// satisfied by the explanation and would prove nothing about the delivery.)
const HEADER = '[新到的消息]'
const blockOf = (text) => {
  const s = String(text || '')
  if (!s.startsWith(HEADER)) return ''
  const end = s.indexOf(NL + NL)
  return end < 0 ? s : s.slice(0, end)
}
const lineCount = (block) => (block === '' ? 0 : block.split(NL).length)

const TMP = 'D:/_tmp/vmu-run254-notice'
mkdirSync(TMP, { recursive: true })
const roots = []
const mkRoot = async (tag) => { const d = await mkdtemp(join(TMP, tag + '-')); roots.push(d); return d }

const boot = async (deliver) => HARNESS.boot({ root: await mkRoot('ws'), clock: () => Date.parse('2026-01-01T00:00:00.000Z'), deliver })
const memberAs = { as: { agent: { id: 'r-1' } } }
const ASSEMBLY = { seat: 'member', roleLabel: '常驻研究员', phase: 'normal', round: 1, roster: 'acad、r-1', statusBlock: '[状态] x', member: 'r-1' }

try {
  console.log('=== 0. SOURCE PINS: the criterion and the producer are named where they live ===')
  ok(MAILBOX_SRC.includes('const want = box.filter((e) => !settledIds.has(String(e.id)))'),
    'mailbox.noticeLines has no read filter: the box only holds un-acked rows (TB-2606-B narrows the same criterion: rows the ACK LEDGER already settled are not rendered either)')
  ok(MAILBOX_SRC.includes('acked: want.length === 0') && MAILBOX_SRC.includes('ackRequired: want.length > 0'),
    'and the receipt NAMES the criterion (acked / ackRequired) instead of leaving the reader to infer it from wording')
  ok(MAILBOX_SRC.includes('settledBy: \'ack\'') && MAILBOX_SRC.includes('unackedRows: want.map('),
    'with settledBy:ack and the un-acked rows themselves, including any cut by the limit')
  // TB-2691 replaced the inline IIFE with the single producer noticeBlockOf(per); the pin follows the SHAPE while
  // still requiring that the aggregate face derives from that one function (not a second loop) and keeps pendingMembers.
  ok(MAILBOX_SRC.includes('const noticeBlockOf = (per) =>') && MAILBOX_SRC.includes('notice: noticeBlockOf(per)')
    && MAILBOX_SRC.includes('pendingMembers'),
    'status() reports the same criterion in aggregate, grouped by recipient (single producer noticeBlockOf)')
  ok(MAILBOX_SRC.includes('notice: noticeBlockOf(mailbox.boxes())'),
    'list() reads the SAME producer over all boxes, so the two faces cannot disagree on the aggregate')
  // The pin reads the FUNCTION BODY (from its name to the next one), because the docblock above it quotes the old
  // expression to explain the defect — a whole-file substring check would be triggered by the explanation itself.
  const replyTextBody = HARNESS_SRC.slice(HARNESS_SRC.indexOf('function replyTextOf'), HARNESS_SRC.indexOf('function simulateSubagents'))
  ok(replyTextBody !== '' && !replyTextBody.includes('String(reply)'),
    'the simulator never stringifies an object into a reply text (P1-6)')
  ok(HARNESS_SRC.includes('shape: reply && typeof reply === \'object\' && Array.isArray(reply.output) ? \'delivery-envelope\' : \'object\''),
    'an unrecognised object becomes a named shape-error marker that keeps the original value')
  ok(HARNESS_SRC.includes('noticeBlock,') && HARNESS_SRC.includes('noticeSource,'),
    'the simulator hands the turn loop a notice producer (P1-5)')
  ok(TURN_SRC.includes('VMU_TURN_DELIVERY_SHAPE'), 'the kernel door that can refuse a bad delivery shape exists')

  console.log('=== 1. P1-1: READING DOES NOT SETTLE, ACK DOES (two real turns over the harness) ===')
  const h = await boot(async () => fence({ say: 'RUN 254-B 的回合答复' }))
  const started = await h.call('vibe_v5_start', { researcherCount: 2 })
  ok(started && started.ok === true, 'the institute started so real turns can be driven', started && started.code)
  const sent = await h.call('vibe_vmu_mailbox', { action: 'send', from: 'office', to: 'r-1', text: 'P1-1 的正文', subject: 'P1-1 结算探针' })
  ok(sent && sent.ok === true, 'an office mail is queued for r-1', sent && sent.code)
  const before = h.kernel.mailbox.noticeLines('r-1')
  // The row id is minted by the mailbox, not echoed by the tool face (`send` answers `ids`, and the durable row is what
  // the notice face reads), so the id under test is the one the MEMBER will see in the line.
  const mailId = String(((before.unackedRows || [])[0] || {}).id || '')
  ok(before.count === 1 && mailId !== '', 'the member has exactly one pending delivery row', { count: before.count, mailId, sentIds: sent && sent.ids })
  ok(before.acked === false && before.ackRequired === true, 'the receipt says an ack is owed (acked:false, ackRequired:true)', before)
  ok(before.settledBy === 'ack', 'and names the ONE operation that settles it', before.settledBy)
  const row0 = (before.unackedRows || [])[0] || {}
  ok(row0.id === mailId && row0.channel === 'mail' && row0.kind === 'dm', 'the un-acked row is named with its channel (mail)', row0)
  ok(row0.read === false, 'and it is still unread, because nothing has opened it yet')
  ok(before.lines.length === 1 && before.lines[0].includes('P1-1 结算探针') && before.lines[0].includes('mailbox ack ' + mailId),
    'the rendered line teaches the ack that actually settles it', before.lines)

  // The simulator assembly and a REAL turn must show the SAME block. The real turn is the reference, not a literal.
  const simA = await h.prompts.assembleFor(ASSEMBLY)
  const blockSimA = blockOf(simA)
  ok(blockSimA !== '', 'the simulator renders the notice block for an un-acked row (P1-5)', { chars: simA.length })
  const driveA = await h.call('vibe_vmu_turn', { op: 'drive', member: 'r-1', rounds: 1, phase: 'normal', why: 'RUN 254-B 回合 A' })
  ok(driveA && driveA.ok === true && driveA.roundsRun === 1, 'the real turn ran', driveA && { ok: driveA.ok, roundsRun: driveA.roundsRun, code: driveA.code })
  const realA = String((h.delivered[h.delivered.length - 1] || {}).text || '')
  const blockRealA = blockOf(realA)
  ok(blockRealA !== '', 'the real turn prompt begins with the same kind of block', { head: realA.slice(0, 40) })
  ok(blockSimA === blockRealA, 'SAME-SOURCE PARITY: identical inbox state renders byte-identical blocks in the simulator and the real turn', { sim: blockSimA, real: blockRealA })
  ok(lineCount(blockSimA) === 2, 'the block is the header plus one delivery line', blockSimA.split(NL))
  ok(blockSimA.includes(before.lines[0]), 'and the line is the mailbox face own rendering, not a second renderer', blockSimA)

  // Open = read. The body is readable, the read flag is set — and the delivery is STILL OWED.
  const opened = await h.call('vibe_vmu_mailbox', { action: 'open', member: 'r-1', id: mailId }, memberAs)
  ok(opened && opened.ok === true && opened.read === true, 'r-1 opened the mail (read:true)', opened && opened.code)
  const afterRead = h.kernel.mailbox.noticeLines('r-1')
  ok(afterRead.count === 1 && afterRead.acked === false, 'READING DID NOT SETTLE THE DELIVERY: the row is still owed an ack', afterRead)
  ok((afterRead.unackedRows || [])[0].read === true, 'and the receipt shows the read flag MOVED (read:true) while the row stayed', afterRead.unackedRows)
  const simB = await h.prompts.assembleFor(ASSEMBLY)
  ok(blockOf(simB) === blockSimA, 'the next simulated prompt still carries the same line, unchanged', blockOf(simB))
  const driveB = await h.call('vibe_vmu_turn', { op: 'drive', member: 'r-1', rounds: 1, phase: 'normal', why: 'RUN 254-B 回合 B' })
  ok(driveB && driveB.roundsRun === 1, 'a second real turn ran', driveB && { roundsRun: driveB.roundsRun, code: driveB.code })
  const realB = String((h.delivered[h.delivered.length - 1] || {}).text || '')
  ok(blockOf(realB) === blockRealA, 'and the second REAL turn still shows the same delivery line (repeat until acked)', { got: blockOf(realB) })
  ok(!blockOf(realB).includes(NL + '  ' + NL), 'without duplicating the line inside the block', blockOf(realB))

  // Ack settles it, and the next prompt loses the block entirely.
  const ack = await h.call('vibe_vmu_mailbox', { action: 'ack', member: 'r-1', ids: [mailId] }, memberAs)
  ok(ack && ack.ok === true && (ack.acked || []).includes(mailId), 'r-1 acked the row', ack && { ok: ack.ok, acked: ack.acked, code: ack.code })
  const settled = await waitFor(() => h.kernel.mailbox.noticeLines('r-1').count === 0)
  ok(settled, 'and the delivery is settled once the shared queue merge finished (ack, not read, is the settlement)')
  const afterAck = h.kernel.mailbox.noticeLines('r-1')
  ok(afterAck.acked === true && afterAck.ackRequired === false && afterAck.unackedRows.length === 0,
    'the receipt now says nothing is owed (acked:true, unackedRows:[])', afterAck)
  const simC = await h.prompts.assembleFor(ASSEMBLY)
  // ★ TB-2724 / RUN 77 (A): OLD world — after the ack the prompt rendered no notice block at all (`blockOf === ''`).
  // Now an empty queue is the NAMED empty block, so what must be gone is the settled MAIL LINE; the header stays and
  // says by name that nothing is left to settle (`lineCount === 1` is the whole reading).
  // `blockOf` ends at the first BLANK line; the named-empty block is a single line, so read the first line directly.
  const simHead = String(simC || '').split(NL)[0]
  ok(simHead === HEADER + ' （无未结算行）' && String(simC || '').indexOf('P1-1 结算探针') === -1,
    'the simulated prompt starts with the NAMED empty block (the settled row is gone)', { head: simHead })
  const driveC = await h.call('vibe_vmu_turn', { op: 'drive', member: 'r-1', rounds: 1, phase: 'normal', why: 'RUN 254-B 回合 C' })
  ok(driveC && driveC.roundsRun === 1, 'a third real turn ran', driveC && { roundsRun: driveC.roundsRun, code: driveC.code })
  const realC = String((h.delivered[h.delivered.length - 1] || {}).text || '')
  // ★ TB-2724 / RUN 77 (A): OLD world — `blockOf(realC) === ''`. Same change as the simulated leg: the settled row is
  // gone, and the block that remains is exactly the one-line named empty.
  const realHead = String(realC || '').split(NL)[0]
  ok(realHead === HEADER + ' （无未结算行）' && String(realC || '').indexOf('P1-1 结算探针') === -1,
    'and a REAL turn after the ack starts with the NAMED empty block', { head: realHead })
  const statusAfter = await h.call('vibe_vmu_mailbox', { action: 'status' })
  ok(statusAfter && statusAfter.notice && statusAfter.notice.acked === true && statusAfter.notice.unackedRows === 0,
    'the aggregate face agrees: no member is owed an ack', statusAfter && statusAfter.notice)

  console.log('=== 2. P1-5: the simulator reads the SAME producer the entry wires (not a second renderer) ===')
  ok(HARNESS_SRC.includes('kernelInboxBlock') && HARNESS_SRC.includes('packInboxBlock'),
    'the harness chooses the pack block with the kernel block as fallback, like the entry')
  ok(HARNESS_SRC.includes('takeNoticesFor') && HARNESS_SRC.includes('noticeLines(String(member), { limit: 8 })'),
    'and folds the Lean one-shot notices with the mailbox lines in the same order the kernel does')
  ok(blockSimA.startsWith(HEADER) && blockRealA.startsWith(HEADER), 'both blocks open with the same header', { sim: blockSimA.slice(0, 12), real: blockRealA.slice(0, 12) })

  console.log('=== 3. P1-6: a delivery envelope is a SHAPE ERROR, never the prose [object Object] ===')
  const h2 = await boot(async () => ({ output: [{ type: 'text', text: 'hi' }] }))
  const started2 = await h2.call('vibe_v5_start', { researcherCount: 1 })
  ok(started2 && started2.ok === true, 'a second institute started for the shape probe', started2 && started2.code)
  const driveShape = await h2.call('vibe_vmu_turn', { op: 'drive', member: 'r-1', rounds: 1, phase: 'normal', why: 'RUN 254-B 形状探针' })
  const deliveredRow = h2.delivered[h2.delivered.length - 1] || {}
  ok(deliveredRow.replyShape === 'shape-error', 'the simulator records the reply as a SHAPE ERROR, not as text', deliveredRow.replyShape)
  ok(deliveredRow.replyChars === 0, 'and invents no character count for it', deliveredRow.replyChars)
  ok(deliveredRow.reply && deliveredRow.reply.shape === 'delivery-envelope' && (deliveredRow.reply.keys || []).indexOf('output') >= 0,
    'the marker names the unrecognised shape and the keys it carried', deliveredRow.reply && { shape: deliveredRow.reply.shape, keys: deliveredRow.reply.keys })
  ok(deliveredRow.reply && deliveredRow.reply.value && deliveredRow.reply.value.output && deliveredRow.reply.value.output[0].text === 'hi',
    'the ORIGINAL structure is passed through untouched (a later gate can name it)', deliveredRow.reply && deliveredRow.reply.value)
  ok(!h2.delivered.some((d) => d.reply === '[object Object]'), 'no delivered reply is the literal [object Object] (the 15-char fabrication is gone)')
  const shapeReceipt = (driveShape && driveShape.receipts && driveShape.receipts[0]) || {}
  ok(driveShape && driveShape.roundsRun === 0, 'no round is claimed to have run on a shape this boundary cannot read', driveShape && driveShape.roundsRun)
  ok(shapeReceipt.failed === true && typeof shapeReceipt.code === 'string' && shapeReceipt.code === 'VMU_TURN_DELIVERY_SHAPE',
    'the end-to-end receipt carries the ADAPTER\'S OWN code (RUN 256 起透传: the retry wrapper no longer relabels VMU_TURN_DELIVERY_SHAPE as VMU_ENGINE_UNAVAILABLE)', shapeReceipt && { code: shapeReceipt.code, message: String(shapeReceipt.message || '').slice(0, 120) })

  // The kernel door itself: the SAME envelope, handed back by a RAW delivery seam, must be refused by name. This is the
  // half the host adapter currently cannot reach (it throws `handed back no reply` first); it is pinned here so the code
  // name and the shape stay aligned with what the simulator now passes through.
  const makeLoop = (deliver) => createTurnOrchestrator({
    sectionPolicy: () => ({ decisions: [] }),
    prompt: createPromptPipeline({ sections: [{ name: 'v5r-charter-opening', order: 100, text: 'OPENING' }], bindings: [], clock: () => '2026-01-01T00:00:00.000Z' }),
    deliver,
  })
  const gated = await makeLoop(async () => ({ output: [{ type: 'text', text: 'hi' }] })).drive({ members: ['r-1'], rounds: 1, phase: 'normal' })
  const gatedRow = (gated && gated.receipts && gated.receipts[0]) || {}
  ok(gated && gated.roundsRun === 0, 'the kernel accepted the drive but ran no round on the unreadable shape', gated && gated.roundsRun)
  ok(gatedRow.failed === true && gatedRow.code === 'VMU_TURN_DELIVERY_SHAPE',
    'VMU_TURN_DELIVERY_SHAPE fires for the envelope the simulator now passes through', gatedRow && { code: gatedRow.code })
  ok(String(gatedRow.message || '').includes('an object with keys [output]'), 'and the refusal names the keys it actually received', String(gatedRow.message || '').slice(0, 160))
  const control = await makeLoop(async () => 'a plain answer').drive({ members: ['r-1'], rounds: 1, phase: 'normal' })
  const controlRow = (control && control.receipts && control.receipts[0]) || {}
  ok(controlRow.code === 'VMU_TURN_NO_FENCE', 'the control proves the door did not swallow the old refusal: a text without a fence is still VMU_TURN_NO_FENCE', { code: controlRow.code })

  for (const inst of [h, h2]) {
    const cleanups = inst && inst.handle && Array.isArray(inst.handle.cleanups) ? inst.handle.cleanups : []
    for (const c of cleanups) { try { await c() } catch { /* teardown never turns a finished test red */ } }
  }
} finally {
  for (const dir of roots) { try { await rm(dir, { recursive: true, force: true }) } catch { /* a leftover directory is not a test failure */ } }
}

console.log(NL + '=== RUN 254-B NOTICE SETTLEMENT: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.log('failures: ' + JSON.stringify(failures)); process.exitCode = 1 }
