// ★ RUN 229 / task-13 — TWO DEFECTS THE SIM TURN SCENARIO MEASURED (scripts/sim/scenarios/turns.mjs corpus-turns):
//   1) THE PARKED TURN WAS A SILENT SINGLE SLOT. `drive` parks a member turn on the caller (`awaiting:true`); a second
//      `drive` overwrote it with no word, and the late reply was refused as `VMU_INVALID_ARGUMENT` ("reply_for names r-1
//      but the open member turn belongs to r-2") — the wrong family, and no hint about what to do next. Now: the second
//      dispatch is refused BY NAME (`VMU_TURN_ALREADY_PARKED`, hint says to answer the parked prompt first) and a reply
//      that names the wrong member is refused as `VMU_TURN_STALE_REPLY` — nothing is silently replaced, nothing is
//      attributed to another member.
//   2) `progress` WAS TAUGHT AS TEXT AND ONLY ACCEPTED AS `{track,title,body}`. The taught text form died with
//      "unknown record track: undefined" — a receipt leaking the literal word `undefined` (audit A2). Now: the text form
//      is accepted and mapped to ONE complete settled progress row (coercion reported in `coercions`), and an object that
//      names no track is skipped by name with the shape it received plus a 60-char excerpt — no `undefined` anywhere.
//
// §0 source-side readings (the two repairs are named shapes, not coincidences)
// §1 a parked turn is still one slot, but a second dispatch is refused with a VMU_TURN_* code and a hint
// §2 a report for the member who is NOT parked is refused as VMU_TURN_STALE_REPLY, on both reply channels
// §3 the parked prompt stays answerable, and the slot frees only when that turn completes
// §4 the taught TEXT form of `progress` writes one complete row and reports the coercion
// §5 an object that names no track is skipped by name, and the message names the shape (no `undefined` leak)
//
// Run: node tests/vmu-run229-turn-parked.test.mjs   Last line: N passed, M failed

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const TURN = join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')
const DOCS03 = join(REPO, 'vibe-math-vmu', 'docs', '03-interface-contract.md')
const SCENARIO = join(REPO, 'scripts', 'sim', 'scenarios', 'turns.mjs')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const kernelTurn = await import(pathToFileURL(TURN).href)
const turnSource = await readFile(TURN, 'utf8')
const docsSource = await readFile(DOCS03, 'utf8')
const scenarioSource = await readFile(SCENARIO, 'utf8')

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r229-')); roots.push(d); return d }

const boot = async (root) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root, deliverMode: 'caller' })
  await handle.ready()
  await handle.kernel.store.open()
  return { handle, K: handle.kernel }
}

const NL = String.fromCharCode(10)
const fence = (obj) => ['```json', JSON.stringify(obj), '```'].join(NL)
const codeOf = (e) => (e && e.code) || null
const attempt = async (fn) => {
  try { return { threw: false, value: await fn() } } catch (e) { return { threw: true, code: codeOf(e), message: e && e.message, hint: e && e.hint } }
}
const receiptOf = (res) => (res && res.receipt) || res || {}
const rowsOf = (res, key) => {
  const receipt = receiptOf(res)
  const detail = receipt[key + 'Detail']
  if (Array.isArray(detail)) return detail
  const list = receipt[key]
  return Array.isArray(list) ? list : []
}

try {
  // ── §0 THE SOURCE-SIDE READING ────────────────────────────────────────────────────────────────────────────────
  {
    console.log('§0 both repairs are named shapes in the kernel source, and the codes are registered')
    ok(turnSource.includes('VMU_TURN_ALREADY_PARKED'), '§0a the second-dispatch refusal has its own name')
    ok(turnSource.includes('VMU_TURN_STALE_REPLY'), '§0b the wrong-member reply refusal has its own name')
    ok(turnSource.includes('progressArgs'), '§0c the progress adapter exists')
    ok(typeof kernelTurn.progressArgs === 'function', '§0d progressArgs is exported (so the mapping is testable alone)')
    const oldStructured = turnSource.includes("fail('VMU_INVALID_ARGUMENT', 'reply_for names '")
    ok(oldStructured === false, '§0e the old VMU_INVALID_ARGUMENT stale-reply refusal is gone', oldStructured)
    ok(docsSource.includes('VMU_TURN_ALREADY_PARKED') && docsSource.includes('VMU_TURN_STALE_REPLY'),
      '§0f both codes are registered in docs/03 section 8')
    ok(scenarioSource.includes('VMU_TURN_ALREADY_PARKED') && scenarioSource.includes('VMU_TURN_STALE_REPLY'),
      '§0g the sim turn scenario measures both codes (the corpus that found the defects re-measures them)')
  }

  // ── §1 A SECOND DISPATCH WHILE A TURN IS PARKED IS REFUSED BY NAME ───────────────────────────────────────────
  {
    console.log('§1 one parked slot, but the second dispatch is named, not silent')
    const b = await boot(await mkRoot())
    await b.K.members.hire({ id: 'r-1', slot: 'member' })
    await b.K.members.hire({ id: 'r-2', slot: 'member' })
    const first = await b.K.turn.drive({ members: ['r-1'], rounds: 1, phase: 'normal', why: 'run229 parked probe' })
    ok(first && first.awaiting === true, '§1a the first dispatch parks a turn on the caller', first && first.memberPrompt)
    ok(first && first.memberPrompt && first.memberPrompt.member === 'r-1', '§1b the parked prompt names r-1')
    const second = await attempt(() => b.K.turn.drive({ members: ['r-2'], rounds: 1, phase: 'normal', why: 'run229 second dispatch' }))
    ok(second.threw === true, '§1c the second dispatch is REFUSED (it does not overwrite the parked prompt)', second)
    ok(second.code === 'VMU_TURN_ALREADY_PARKED', '§1d the refusal is in the VMU_TURN_* family', second.code)
    ok(typeof second.message === 'string' && second.message.includes('already parked'), '§1e the message says a turn is already parked', second.message)
    ok(typeof second.message === 'string' && second.message.includes('r-1'), '§1f the message names the member whose turn is parked', second.message)
    ok(typeof second.hint === 'string' && second.hint.includes('answer the parked prompt first') && second.hint.includes('op:"step"'),
      '§1g the hint says how to continue (answer the parked prompt, then dispatch again)', second.hint)
    const pendingAfter = b.K.turn.awaitingCaller ? b.K.turn.awaitingCaller() : null
    ok(pendingAfter === true, '§1h the parked prompt survived the refused dispatch')
  }

  // ── §2 A REPORT FOR A MEMBER WHO IS NOT PARKED IS A STALE REPLY ─────────────────────────────────────────────
  {
    console.log('§2 reply_for names the wrong member: stale, on both channels, nothing attributed')
    const b = await boot(await mkRoot())
    await b.K.members.hire({ id: 'r-1', slot: 'member' })
    await b.K.members.hire({ id: 'r-2', slot: 'member' })
    const parked = await b.K.turn.drive({ members: ['r-1'], rounds: 1, phase: 'normal', why: 'run229 stale probe' })
    ok(parked && parked.awaiting === true, '§2a r-1 s turn is parked')
    const structured = await attempt(() => b.K.turn.supplyStructuredReply({ say: 'r-2 插话' }, { forMember: 'r-2' }))
    ok(structured.threw === true, '§2b the structured channel refuses a report for the non-parked member', structured)
    ok(structured.code === 'VMU_TURN_STALE_REPLY', '§2c its code is VMU_TURN_STALE_REPLY', structured.code)
    ok(typeof structured.message === 'string' && structured.message.includes('r-2') && structured.message.includes('r-1'),
      '§2d the message names BOTH members (asked r-2, parked r-1)', structured.message)
    ok(typeof structured.hint === 'string' && structured.hint.length > 40, '§2e and carries a hint', structured.hint)
    const bare = await attempt(() => b.K.turn.supplyMemberReply(fence({ say: 'r-2 插话' }), 'r-2'))
    ok(bare.threw === true, '§2f the bare-reply channel refuses it too (no wrong-member attribution)', bare)
    ok(bare.code === 'VMU_TURN_STALE_REPLY', '§2g the bare-reply channel uses the same code', bare.code)
    const stillParked = b.K.turn.awaitingCaller ? b.K.turn.awaitingCaller() : null
    ok(stillParked === true, '§2h neither refused report consumed the parked turn')
  }

  // ── §3 THE PARKED PROMPT STAYS ANSWERABLE, AND THE SLOT FREES WHEN THAT TURN COMPLETES ─────────────────────
  {
    console.log('§3 answer the parked member, then the next member can be dispatched')
    const b = await boot(await mkRoot())
    await b.K.members.hire({ id: 'r-1', slot: 'member' })
    await b.K.members.hire({ id: 'r-2', slot: 'member' })
    const parked = await b.K.turn.drive({ members: ['r-1'], rounds: 1, phase: 'normal', why: 'run229 answer parked' })
    ok(parked && parked.awaiting === true, '§3a r-1 s turn is parked')
    const accepted = await attempt(() => b.K.turn.supplyStructuredReply({ say: 'r-1 的答复：我在这一回合完成自己的动作。' }, { forMember: 'r-1' }))
    ok(accepted.threw === false && accepted.value && accepted.value.ok === true,
      '§3b the parked member report is ACCEPTED', accepted.threw ? accepted : accepted.value)
    const next = await attempt(() => b.K.turn.drive({ members: ['r-2'], rounds: 1, phase: 'normal', why: 'run229 dispatch after answering' }))
    ok(next.threw === false, '§3c after the parked turn is answered, a dispatch is allowed again', next.threw ? next : null)
    const drove = next.value || {}
    ok(drove.awaiting === true && drove.memberPrompt && drove.memberPrompt.member === 'r-2',
      '§3d and the new prompt parks r-2', drove.memberPrompt)
  }

  // ── §4 THE TAUGHT TEXT FORM OF `progress` WRITES ONE COMPLETE ROW ───────────────────────────────────────────
  {
    console.log('§4 progress as text: one complete settled row, coercion reported, turn survives')
    const mapped = kernelTurn.progressArgs('完成第一步：定义已固定，下一步给出引理。', 'r-1')
    ok(mapped && mapped.ok === true && Array.isArray(mapped.args) && mapped.args.length === 1, '§4a a text payload maps to ONE args row', mapped)
    const row = mapped && mapped.args && mapped.args[0]
    ok(row && row.track === 'progress' && row.kind === 'progress', '§4b the row is a progress row', row)
    ok(row && row.settled === true, '§4c and it is settled (a complete writing, not a half record)', row)
    ok(row && row.by === 'r-1', '§4d and authored by the turn member', row)
    ok(row && typeof row.body === 'string' && row.body.includes('定义已固定'), '§4e the whole text travels as the body', row)
    // ★ RUN 60 / task-30 (M5): the title used to be `firstLine.slice(0, 80)`, which cut a live row into the half word
    // `…n2-difference-telescop`. The title is now FIXED per member, so this pin checks the fixed shape - a complete,
    // greppable act name - instead of the old "first line, bounded" promise.
    ok(row && row.title === 'r-1 · 本轮 progress', '§4f the title is FIXED per member (never a truncated first line)', row && row.title)
    ok(mapped && mapped.coerced && mapped.coerced.from === 'string' && mapped.coerced.to.includes('progress row'),
      '§4g the mapping is declared as a coercion (a reader can tell text from the object form)', mapped && mapped.coerced)

    const b = await boot(await mkRoot())
    await b.K.members.hire({ id: 'r-1', slot: 'member' })
    const opened = await b.K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run229 progress text' })
    ok(opened && opened.awaiting === true, '§4h a member turn opens')
    const supplied = await b.K.turn.supplyMemberReply(fence({ say: '按文本记一条进展', progress: '完成第一步：定义已固定，下一步给出引理。' }), 'r-1')
    ok(supplied && supplied.ok === true, '§4i the reply is supplied', supplied)
    const done = await b.K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run229 progress text apply' })
    const receipt = receiptOf(done)
    const progressRows = rowsOf(done, 'executedDetail').filter((e) => e && e.field === 'progress')
    ok(receipt.executed === 1 && progressRows.length === 1, '§4j the progress field was dispatched exactly once',
      { executed: receipt.executed, rows: rowsOf(done, 'executedDetail').map((e) => e && e.field) })
    ok(progressRows[0] && progressRows[0].coerced && progressRows[0].coerced.from === 'string',
      '§4k the executed row carries the coercion', progressRows[0] && progressRows[0].coerced)
    // ★ RULE E shape A: this scenario skips NOTHING, so `.every()` over the skip list would pass while proving
    // nothing. The claim is therefore stated as counted facts: the receipt's own `skipped` count must equal the rows
    // the receipt lists, and none of those rows may name progress.
    const skippedFields = rowsOf(done, 'skippedDetail').map((s) => s && s.field)
    ok(Array.isArray(skippedFields) && receipt.skipped === skippedFields.length && skippedFields.includes('progress') === false,
      '§4l nothing about progress was skipped (the receipt count and the listed rows agree)',
      { skipped: receipt.skipped, rows: skippedFields })
    ok(Array.isArray(receipt.coercions) && receipt.coercions.some((c) => c && c.field === 'progress' && c.from === 'string'),
      '§4m the receipt lists the coercion', receipt.coercions)
    ok(/undefined/.test(JSON.stringify(receipt)) === false, '§4n the receipt does not leak the word undefined')
  }

  // ── §5 AN OBJECT THAT NAMES NO TRACK IS SKIPPED BY NAME, NAMING ITS SHAPE ───────────────────────────────────
  {
    console.log('§5 progress as an object with no track: skipped by name, shape named, no undefined leak')
    const bad = kernelTurn.progressArgs({ title: '只有标题', body: '没有轨名' }, 'r-1')
    ok(bad && bad.ok === false, '§5a the adapter refuses it', bad)
    ok(bad && bad.reason === 'progress-shape', '§5b the skip reason is progress-shape', bad && bad.reason)
    ok(bad && bad.code === 'VMU_INVALID_ARGUMENT', '§5c the code is VMU_INVALID_ARGUMENT', bad && bad.code)
    ok(bad && Array.isArray(bad.missing) && bad.missing.includes('track'), '§5d it says what is missing (track)', bad && bad.missing)
    ok(bad && typeof bad.message === 'string' && bad.message.includes('first 60 chars'), '§5e the message carries a 60-char excerpt', bad && bad.message)
    ok(bad && typeof bad.message === 'string' && /undefined/.test(bad.message) === false, '§5f the message never says undefined', bad && bad.message)
    ok(bad && typeof bad.message === 'string' && /\[object Object\]/.test(bad.message) === false, '§5g nor [object Object]', bad && bad.message)
    ok(bad && typeof bad.hint === 'string' && bad.hint.length > 40, '§5h and it carries a hint', bad && bad.hint)
    ok(kernelTurn.progressArgs({ track: 'progress', title: 't', body: 'b' }, 'r-1') === null,
      '§5i the taught object form still goes through the normal dispatch (adapter steps aside)')

    const b = await boot(await mkRoot())
    await b.K.members.hire({ id: 'r-1', slot: 'member' })
    const opened = await b.K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run229 progress shape' })
    ok(opened && opened.awaiting === true, '§5j a member turn opens')
    await b.K.turn.supplyMemberReply(fence({ say: '形状不对的一条', progress: { title: '只有标题', body: '没有轨名' } }), 'r-1')
    const done = await b.K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run229 progress shape apply' })
    const receipt = receiptOf(done)
    ok(done && done.ok === true && receipt && receipt.ok !== false, '§5k the turn SURVIVES a wrong progress shape', done && done.ok)
    const skipped = rowsOf(done, 'skippedDetail').filter((s) => s && s.field === 'progress')
    ok(skipped.length === 1 && receipt.skipped >= 1, '§5l the field is skipped by name',
      { skipped: receipt.skipped, rows: rowsOf(done, 'skippedDetail').map((r) => r && r.field) })
    ok(skipped[0] && skipped[0].code === 'VMU_INVALID_ARGUMENT' && skipped[0].reason === 'progress-shape',
      '§5m the skip carries code and reason', skipped[0])
    ok(skipped[0] && typeof skipped[0].message === 'string' && skipped[0].message.includes('first 60 chars'),
      '§5n the skip message names the shape it received', skipped[0] && skipped[0].message)
    ok(/undefined/.test(JSON.stringify(receipt)) === false, '§5o the whole receipt is free of the literal undefined')
  }
} finally {
  for (const r of roots) { try { await rm(r, { recursive: true, force: true }) } catch { /* best effort */ } }
}

console.log('')
console.log(passed + ' passed, ' + failed + ' failed')
if (failed > 0) process.exitCode = 1
