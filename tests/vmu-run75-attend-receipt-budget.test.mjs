#!/usr/bin/env node
/**
 * tests/vmu-run75-attend-receipt-budget.test.mjs — TB-2694 / F75-05：一条 attend 回执 = 每份读数各一份，且装得进预算。
 * 本文件同时钉 F75-05（attend 回执预算）与 F75-07（wireOnly 差集）——两者都是「回执说清自己量了什么」。
 *
 * THE LIVE MEASUREMENT THIS PINS (run 75, build 92bc6d94 — captured answer, not inferred): one
 * `vibe_v5_meeting {op:"attend"}` came back at 16 163 bytes on the wire (16 588 with `receiptMeta`), i.e. against the
 * 12 000-byte contract in kernel/receiptbounds.js, and the exceedance was PURE DUPLICATION, not content:
 *   · `quorum` travelled twice (top level 3 563 B + `receipt.quorum` 3 563 B),
 *   · the start window travelled twice (`lateReads` inside `receipt`, 3 161 B, was a full copy of the top level),
 *   · `arrival` travelled twice and `arrival.means` was the SAME sentence as `arrivalMeans` (328 B twice),
 *   · `receipt` itself was a complete copy of the reading block (`receiptMeta.originalBytes` sailed past the budget
 *     while its note said "no string leaf exceeded 2000" — true and irrelevant: nothing BIG needed cutting, only the
 *     COPIES did).
 *
 * THE FIX (kernel/meetings.js, assembly only — no kernel arithmetic moved): each reading travels ONCE. The answer's
 * `receipt` is now a POINTER (`see` → top level + `meetings.receiptsView`); the recorded receipt (what receiptsView /
 * minutes read) still holds every reading in full, so "one wire copy" did not become "one copy total".
 * MEASURED AFTER: the same captured answer, de-duplicated to this shape, is 8 006 B pre-meta (7 985 with a shortened
 * `see`) — under the 8 192 B budget the task set, and the in-process answer is 6 467 B (4 seats) / 6 513 B (6 seats).
 * The envelope+attribution block the pack and host add on the real wire measured 1 036–1 361 B on that same capture,
 * which is why §1 requires kernel-out + 1 400 B headroom to still fit 8 192.
 *
 * ★ ANTI-REGRESSION (the point of this file): re-introducing the nested copies (making `wireReads` return the reads
 *   untouched and `wireReceipt` return the recorded receipt) turns §1/§2 red — measured, see the delivery report.
 *
 * §7 (TB-2694 / F75-07, same run — the receipt-face half of the same taskbook): a temp seat's `tool_help` printed
 * `declaredCount:48 / allowCount:8 / denyCount:40` while `measuredSet.tools` listed 40 rows. The 32 extra rows were
 * framework/host faces the v5r seat table does not govern — the receipt published the two numbers and never named
 * the difference, so "mounted" could be read as "authorized". `toolHelp` now also publishes `wireOnly` (named rows +
 * count + a governed/deniedBy per row) and `declarationOnly`. §7 pins temp=32-named, chair=0, and session-less =
 * unavailable/null (never a claimed 0). ★ ANTI-REGRESSION: removing those fields from the return object turns §7b–§7n
 * red (12 assertions) — measured, see the delivery report.
 *
 * Run: node tests/vmu-run75-attend-receipt-budget.test.mjs   (targeted only)
 */
import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'
import { boundedToolResult, safeStringify } from '../vibe-math-vmu/kernel/receiptbounds.js'
import { V5R_PACK_TOOLS } from '../vibe-math-vmu/packs/v5r/tools.js'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { makeTurnSpec } from '../vibe-math-vmu/tools/turn.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed++; console.log('  ok   ' + name) }
  else { failed++; failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}
const has = (text, needle, name) => ok(typeof text === 'string' && text.includes(needle), name, typeof text === 'string' ? text.slice(0, 240) : text)

/* ── kernel harness: the shape tests/vmu-run225/run236/run251 use ───────────────────────────────────────────── */

let NOW = 1000
const mk = (settings = {}) => {
  NOW = 1000
  return createMeetings({ clock: () => NOW, settings: { get: (k) => settings[k] }, log: () => {} })
}
const MEET = { type: 'ordinary', chair: 'acad', roster: ['acad', 'r-1', 'r-2', 'r-3'] }
const MEET6 = { type: 'ordinary', chair: 'acad', roster: ['acad', 'r-1', 'r-2', 'r-3', 'r-4', 'r-5'] }

/** every path at which `key` appears (the duplicate it names is exactly what F75-05 measured). */
const pathsOfKey = (node, key, path = '') => {
  const out = []
  const walk = (n, p) => {
    if (n === null || typeof n !== 'object') return
    if (Array.isArray(n)) { n.forEach((v, i) => walk(v, p + '[' + i + ']')); return }
    for (const k of Object.keys(n)) {
      if (k === key) out.push(p + '.' + k)
      walk(n[k], p + '.' + k)
    }
  }
  walk(node, path)
  return out
}
/** the RECORDED receipt (what minutes / receiptsView read) — still expected to carry every reading. */
const recordedAttend = (svc) => {
  const v = svc.receiptsView({ limit: 10 })
  return (v.receipts || []).filter((r) => r && r.action === 'attend').slice(-1)[0] || null
}
/** the pack+host envelope on the live wire measured 1 036–1 361 B; 1 400 is the headroom §1 budgets for it. */
const ENVELOPE_ALLOWANCE = 1400
const BUDGET = 8192

console.log('=== 1. F75-05: one attend answer fits the 8 KB budget (live: 16 163 B wire / 16 588 B with meta) ===')
{
  const t = mk({})
  const o = t.open(MEET)
  NOW = 2000
  const at = t.attend({ meeting: o.meeting, member: 'r-1' })
  ok(at.ok === true, 'premise: r-1 attends (the same call that produced the 16 163 B answer)', at && { ok: at.ok, state: at.state })
  const bounded = JSON.parse(boundedToolResult(at))
  const meta = bounded.receiptMeta
  ok(meta.originalBytes + ENVELOPE_ALLOWANCE < BUDGET,
    '★★ F75-05: kernel answer + measured envelope headroom is UNDER 8 192 B (live was 16 163 B)',
    { kernelBytes: meta.originalBytes, withHeadroom: meta.originalBytes + ENVELOPE_ALLOWANCE, liveMeasured: 16163 })
  ok(meta.originalBytes < 16163 / 2,
    '★★ …it is less than HALF the live answer, i.e. a whole duplicated copy left the wire', { kernelBytes: meta.originalBytes })
  ok(meta.truncated === false && Array.isArray(meta.elided) && meta.elided.length === 0,
    '★★ nothing was ELIDED to get under the budget (the fix removed copies, it did not cut content)', meta.elided)
  ok(meta.originalBytes === safeStringify(at).length,
    '★ receiptMeta.originalBytes is the real pre-meta serialized size (not a fabricated number)',
    { reported: meta.originalBytes, actual: safeStringify(at).length })
}

console.log('\n=== 2. F75-05: each reading travels ONCE — the duplicates the live capture showed are gone ===')
{
  const t = mk({})
  const o = t.open(MEET)
  NOW = 2000
  const at = t.attend({ meeting: o.meeting, member: 'r-1' })
  ok(JSON.stringify(pathsOfKey(at, 'quorum')) === JSON.stringify(['.quorum']),
    '★★ F75-05: `quorum` appears at exactly ONE path (live: top level + receipt.quorum)', pathsOfKey(at, 'quorum'))
  ok(JSON.stringify(pathsOfKey(at, 'arrival')) === JSON.stringify(['.arrival']),
    '★★ F75-05: `arrival` appears at exactly ONE path (live: top level + receipt.lateReads.arrival)', pathsOfKey(at, 'arrival'))
  ok(at.receipt && typeof at.receipt === 'object', '★ the answer still carries a `receipt` key (its shape changed, not its existence)', at.receipt)
  has(at.receipt.see, 'TOP LEVEL', '★★ F75-05: `receipt` is a POINTER: it says where the readings are')
  has(at.receipt.see, 'receiptsView', '★ …and where the FULL recorded receipt can be read')
  ok(at.receipt.quorum === undefined && at.receipt.lateReads === undefined && at.receipt.state === undefined,
    '★★ F75-05: the pointer carries no second copy of quorum / lateReads / state', Object.keys(at.receipt))
  ok(at.arrival.means === undefined && typeof at.arrivalMeans === 'string',
    '★★ F75-05: `arrival` no longer repeats the sentence that `arrivalMeans` already is (live: 328 B twice)', at.arrival)
  ok(Array.isArray(at.firedWaiters) && at.receipt.firedWaiters === undefined,
    '★★ the fired waiters were NOT lost with the copy: they are on the top level (once), as host.js liftFiredWaiters expects',
    { top: Array.isArray(at.firedWaiters) })
}

console.log('\n=== 3. F75-05: the RECORDED receipt keeps every reading (de-duplicating the WIRE dropped nothing) ===')
{
  const t = mk({})
  const o = t.open(MEET)
  NOW = 2000
  const at = t.attend({ meeting: o.meeting, member: 'r-1' })
  const rec = recordedAttend(t)
  ok(rec !== null, 'premise: the meeting recorded an attend receipt', rec && Object.keys(rec))
  ok(rec && rec.lateReads && Number(rec.lateReads.elapsedMs) === Number(at.elapsedMs) && rec.lateMeans === at.lateMeans,
    '★★ the recorded receipt still has lateReads + the same lateMeans sentence as the answer', rec && rec.lateReads)
  ok(rec && rec.quorum && rec.quorum.present === at.quorum.present && rec.quorum.met === at.quorum.met,
    '★★ the recorded receipt still has the full quorum reading, with the same numbers', rec && rec.quorum && { present: rec.quorum.present, met: rec.quorum.met })
  ok(rec && rec.state === at.state && rec.settled === at.settled && rec.enforcedScope === at.enforcedScope,
    '★★ …and the same state / settled / enforcedScope (the pointer and the record describe one event)', rec && { state: rec.state, settled: rec.settled })
  ok(rec && JSON.stringify(rec.firedWaiters) === JSON.stringify(at.firedWaiters),
    '★★ …and the same firedWaiters array', rec && rec.firedWaiters)
}

console.log('\n=== 4. F75-05: the de-duplicated answer still answers "who arrived / who is missing / when did it start" ===')
{
  const t = mk({})
  const o = t.open(MEET)
  NOW = 2000
  const at = t.attend({ meeting: o.meeting, member: 'r-1' })
  ok(typeof at.arrival.electoratePresent === 'number' && at.arrival.electoratePresent === at.quorum.present,
    '★★「谁到了」: arrival.electoratePresent is a number and agrees with quorum.present', { arrival: at.arrival.electoratePresent, quorum: at.quorum.present })
  ok(Array.isArray(at.arrival.missing) && at.arrival.missing.includes('r-2') && at.arrival.missing.includes('r-3'),
    '★★「差谁」: arrival.missing still names the missing members', at.arrival.missing)
  const s = mk({})
  const os = s.open({ type: 'ordinary', chair: 'acad', roster: ['acad', 'r-1', 'r-2', 'r-3'], materials: 'x', at: '+180s' })
  const sAt = s.attend({ meeting: os.meeting, member: 'r-1' })
  ok(sAt.ok === true && sAt.started === false && sAt.openedAt === null && typeof sAt.startsInMs === 'number' && sAt.startsInMs > 0,
    '★★「几点开始」: while SCHEDULED, startsInMs is the answer and openedAt says "no baseline yet"',
    { ok: sAt.ok, started: sAt.started, openedAt: sAt.openedAt, startsInMs: sAt.startsInMs })
  const t2 = mk({})
  const o2 = t2.open(MEET)
  const at2 = t2.attend({ meeting: o2.meeting, member: 'r-1' })
  ok(at2.started === true && at2.startedAt === 1000 && typeof at2.elapsedSinceMs === 'number' && at2.startsInMs === null,
    '★★「几点开始」: once the attendance rule completes, startedAt + elapsedSinceMs are the answer and startsInMs is null',
    { started: at2.started, startedAt: at2.startedAt, elapsedSinceMs: at2.elapsedSinceMs, startsInMs: at2.startsInMs })
}

console.log('\n=== 5. F75-05: the chair-held (pendingLate) path is de-duplicated by the SAME rule ===')
{
  const t = mk({ 'vmu.meetings.lateAfterMs': 3000 })
  const o = t.open(Object.assign({}, MEET, { lateAdmission: 'chair' }))
  NOW = 11000
  const door = t.attend({ meeting: o.meeting, member: 'r-1' })
  ok(door.ok === true && door.late === true && door.pendingLate === true,
    'premise: a late arrival under lateAdmission:"chair" is held at the door', { late: door.late, pendingLate: door.pendingLate })
  const meta = JSON.parse(boundedToolResult(door)).receiptMeta
  ok(meta.originalBytes + ENVELOPE_ALLOWANCE < BUDGET,
    '★★ the door answer is also under the budget', { kernelBytes: meta.originalBytes, withHeadroom: meta.originalBytes + ENVELOPE_ALLOWANCE })
  ok(door.receipt && door.receipt.lateReads === undefined && typeof door.receipt.see === 'string',
    '★★ the door answer also points at the readings instead of copying them', door.receipt && Object.keys(door.receipt))
  const recDoor = recordedAttend(t)
  ok(recDoor && recDoor.lateReads && Number(recDoor.lateReads.lateAfterMs) === 3000,
    '★★ the door RECORD still carries the threshold it was judged against', recDoor && recDoor.lateReads)
}

console.log('\n=== 6. F75-05: a 6-seat roster does not blow the budget either (roster size must not re-inflate the copy) ===')
{
  const t = mk({})
  const o = t.open(MEET6)
  NOW = 2000
  const at = t.attend({ meeting: o.meeting, member: 'r-1' })
  const meta = JSON.parse(boundedToolResult(at)).receiptMeta
  ok(meta.originalBytes + ENVELOPE_ALLOWANCE < BUDGET,
    '★★ a 6-seat attend stays under 8 192 B with the envelope headroom',
    { kernelBytes: meta.originalBytes, withHeadroom: meta.originalBytes + ENVELOPE_ALLOWANCE })
  ok(JSON.stringify(pathsOfKey(at, 'quorum')) === JSON.stringify(['.quorum']), '★★ …and still has exactly one quorum reading', pathsOfKey(at, 'quorum'))
}

/* ── 7. F75-07 / TB-2694 A: the wire carries rows the seat table does not govern ───────────────────────────── */

console.log('\n=== 7. F75-07: `wireOnly` names the rows the live wire offers but the DECLARED face does not (the 40-vs-8) ===')
{
  // The live measurement this pins (run 75, build 92bc6d94): `vibe_v5_tool_help{member:"r-temp"}` answered
  // declaredCount 48 / allowCount 8 / denyCount 40, yet `measuredSet.tools` still listed 40 rows — because 32 of
  // them are framework/host faces the v5r seat table does NOT govern. "Mounted" was being read as "authorized":
  // the receipt never said which 32 it was, so the 48-vs-8-vs-40 numbers could not be reconciled by the reader.
  const PACK_NAMES = (V5R_PACK_TOOLS || []).map((t) => (t && t.name) || null).filter(Boolean)
  const helpSpec = (V5R_PACK_TOOLS || []).filter((t) => t && t.name === 'vibe_v5_tool_help')[0]
  ok(!!helpSpec && typeof helpSpec.handler === 'function', '★★ the pack exports the tool_help forwarder this section drives', helpSpec && Object.keys(helpSpec))

  // The live temp wire, exactly: the 8 declared-allowed faces plus 32 framework/host rows. Nothing here is the
  // seat table's business; each of those 32 is judged by its own call-time face on the real machine.
  const HOST32 = ['working_directory', 'read', 'write', 'edit', 'glob', 'grep', 'skill', 'read_image', 'todo_write',
    'math_computation', 'vibe_vmu_status', 'exit_plan_mode', 'vibe_vmu_set', 'vibe_vmu_records', 'vibe_vmu_pack',
    'vibe_vmu_turn', 'vibe_vmu_tools', 'vibe_vmu_vote', 'vibe_vmu_env', 'vibe_vmu_control', 'vibe_vmu_meeting',
    'vibe_vmu_task', 'vibe_vmu_mathtools', 'vibe_vmu_reviewers', 'vibe_vmu_human', 'vibe_vmu_chat', 'vibe_vmu_mailbox',
    'vibe_vmu_panel', 'vibe_vmu_report', 'vibe_vmu_direction', 'vibe_vmu_mathjobs', 'vibe_vmu_middleware']
  const ALLOW8 = ['vibe_v5_say', 'vibe_v5_inbox', 'vibe_v5_wait', 'vibe_v5_task_list', 'vibe_v5_task_get',
    'vibe_v5_task_update', 'vibe_v5_tool_help', 'vibe_v5_read_library']
  const roster = [{ id: 'r-temp', slot: 'temp' }, { id: 'r-acad', slot: 'chair' }]
  const kernelFor = (measured) => ({
    members: { roster: () => roster },
    toolsView: ({ member }) => (measured === null
      ? { ok: true, member, count: null, tools: null, hidden: [], source: 'no-live-agent' }
      : { ok: true, member, count: measured.length, tools: measured.map((n) => ({ name: n, purpose: null })), hidden: [], source: 'seat' }),
  })
  const readHelp = (member, measured) => helpSpec.handler({ member }, { kernel: kernelFor(measured) })

  // ── the temp seat: 8 declared-allowed + 32 ungoverned rows ⇒ wireOnly names exactly those 32 ──
  const temp = readHelp('r-temp', ALLOW8.concat(HOST32))
  const wo = temp.wireOnly || {}
  const wtools = Array.isArray(wo.tools) ? wo.tools : []
  const wrows = Array.isArray(wo.rows) ? wo.rows : []
  ok(temp.declaredCount === 48 && temp.allowCount === 8 && temp.denyCount === 40 && temp.measuredSet.count === 40,
    '★★ §7a the 40-vs-8-vs-48 numbers are still published unchanged (the defect was never the counts)',
    { d: temp.declaredCount, a: temp.allowCount, x: temp.denyCount, m: temp.measuredSet && temp.measuredSet.count })
  ok(!!wo && wo.available === true, '★★ §7b tool_help publishes `wireOnly` for a live wire (not omitted)', wo && Object.keys(wo))
  ok(wo.count === 32 && wtools.length === 32 && wrows.length === 32,
    '★★★ §7c wireOnly names EXACTLY the 32 rows the declared face does not name (the live difference, not a null)',
    { count: wo.count, tools: wtools.length, rows: wrows.length })
  ok(JSON.stringify(wtools.slice().sort()) === JSON.stringify(HOST32.slice().sort()),
    '★★★ §7d …and the named set IS the live 32 (no rounding, no sampling)', wtools)
  ok(wtools.includes('vibe_vmu_vote') && wtools.includes('vibe_vmu_meeting'),
    '★★ §7e the two rows the real run actually refused are named in the difference (vote / meeting)',
    wtools.filter((n) => n === 'vibe_vmu_vote' || n === 'vibe_vmu_meeting'))
  ok(wrows.length === 32 && wrows.every((r) => r.governed === false && r.deniedBy === null && typeof r.why === 'string' && r.why.includes('framework/host face')),
    '★★★ §7f every name in §7c is marked ungoverned (the seat table is not the judge of those rows)',
    wrows[0])
  ok(wo.measuredCount === 40 && wo.declaredAllowedCount === 8 && wo.count === wo.measuredCount - wo.declaredAllowedCount,
    '★★ §7g the receipt shows the subtraction that produced the count (40 − 8 = 32)', { m: wo.measuredCount, d: wo.declaredAllowedCount, c: wo.count })
  ok(temp.declarationOnly && temp.declarationOnly.count === 0,
    '★★ §7h the other direction is published too: every DECLARED-allowed face is on this wire, so declarationOnly is 0',
    temp.declarationOnly && temp.declarationOnly.count)

  // ── a GOVERNED row that is denied by the seat: the difference must say WHY it is refused, by name ──
  const governed = readHelp('r-temp', ALLOW8.concat(HOST32).concat(['vibe_v5_record_proposition']))
  const gwo = governed.wireOnly || {}
  const grow = (Array.isArray(gwo.rows) ? gwo.rows : []).filter((r) => r.name === 'vibe_v5_record_proposition')[0]
  ok(gwo.count === 33 && !!grow && grow.governed === true && grow.deniedBy && grow.deniedBy.slot === 'temp',
    '★★★ §7i when the difference IS a seat-governed pack face, the row is marked governed and names the denying seat table',
    { count: gwo.count, row: grow })

  // ── the chair seat: its wire holds exactly its declared face ⇒ the difference is empty (it is NOT always non-zero) ──
  const chair = readHelp('r-acad', PACK_NAMES)
  const cwo = chair.wireOnly || {}
  ok(chair.allowCount === 48 && cwo.available === true && cwo.count === 0 && Array.isArray(cwo.tools) && cwo.tools.length === 0,
    '★★★ §7j a privileged seat with a wire equal to its declared face reads wireOnly 0 — the field is computed, not hard-coded',
    { a: chair.allowCount, count: cwo.count })

  // ── no live session: the honest answer is "no wire to compare", NOT "difference 0" ──
  const none = readHelp('r-temp', null)
  const nwo = none.wireOnly || {}
  ok(nwo.available === false && nwo.count === null && nwo.tools === null,
    '★★★ §7k without a live Agent, wireOnly says unavailable/null — it never claims a 0 difference it did not measure',
    { a: nwo.available, c: nwo.count })

  // ── the sentence that keeps "mounted" from being read as "authorized" ──
  has(temp.wireOnlyMeans, 'NOT permission', '★★★ §7l wireOnlyMeans says a listed row is NOT permission')
  has(temp.wireOnlyMeans, 'refusal', '★★ §7m …and not a refusal either: the call-time faces decide each row')
  ok(!!temp.wireOnly && temp.wireOnlyMeans === temp.wireOnly.means, '★ §7n the top-level sentence is the nested object\'s own sentence (one fact, one text)')
}

/* ── §8 TB-2694 / F75-06: a member reading `op:"status"` in ITS OWN session ─────────────────────────────────
 * Run 75, captured answer (not inferred): r-temp's own `vibe_vmu_turn {op:"status"}` answered `turns:0`,
 * `turnReceipts:[]`, `counts.refused:0` — because a member session runs on a SECOND kernel instance over the same
 * root, so the parent's in-memory ledger is invisible to it (`dispatch` was all zeros too: it could not even see the
 * delivery). The durable `turns` row is the ONE fact both kernels can read: settlement now projects
 * `status/codes/skipped/emptyReply` onto it, and `op:"status"` gives the member that owns the row a READ-ONLY
 * `lastTurn` read from that projection. A member still cannot step/abandon/prompt (VMU_NOT_PERMITTED), and a member
 * with no turn yet reads `lastTurn:null` — never a fabricated empty list. */
{
  const mkRoot = () => mkdtempSync(join(tmpdir(), 'vmu-tb2694-b-'))
  const fence = (o) => ['```json', JSON.stringify(o), '```'].join('\n')
  const openKernel = async (root, extra) => {
    const k = createKernel(Object.assign({ root, clock: () => 1000, settings: {} }, extra))
    await k.store.open()
    return k
  }
  const turnSpec = (k) => makeTurnSpec({
    param: (type, description, extra = {}) => Object.assign({ type, required: false, description }, extra),
    refused: (code, message, hint) => ({ ok: false, code, message, hint: hint || null }),
    TOOL_NAMES: { turn: 'vibe_vmu_turn' }, kernel: k,
  })
  const parse = (raw) => (raw && typeof raw === 'object' ? raw : JSON.parse(String(raw)))
  const asMember = async (spec, k, session, args) => parse(await spec.execute(args, { kernel: k, agent: { id: session } }))
  const durableRow = (k, member) => (Array.isArray(k.store.read('turns')) ? k.store.read('turns') : []).filter((r) => r && r.member === member).slice(-1)[0] || null

  const roots = []
  try {
    const root = mkRoot(); roots.push(root)
    const k = await openKernel(root, {
      settings: { 'vmu.turn.unknownReplyFieldMode': 'refuse' },
      deliverTurn: async () => ({ reply: fence({ progress: 'wrote a row', refuse: true }), deliveryPath: 'fake-delegated' }),
    })
    let code = null
    try { await k.turn.run({ member: 'r-1', phase: 'normal', round: 1, role: 'researcher', roleLabel: '常驻研究员', why: 'tb2694/f75-06' }) } catch (e) { code = e && e.code }
    ok(code === 'VMU_TURN_UNKNOWN_FIELD', '★★ §8a the parent kernel refused the unknown reply field by NAME (the same refusal run 75 produced)', { code })
    let row = durableRow(k, 'r-1')
    for (let i = 0; i < 100 && (!row || row.status === 'open' || row.status === null); i += 1) {
      await new Promise((r) => setTimeout(r, 20))
      row = durableRow(k, 'r-1')
    }
    ok(!!row && row.status === 'failed' && Array.isArray(row.codes) && row.codes.includes('VMU_TURN_UNKNOWN_FIELD'),
      '★★★ §8b the durable `turns` row SETTLED as failed and carries the refusal code (the projection the member can read)',
      row)
    ok(!!row && typeof row.at === 'string' && row.at !== '', '★★ §8c …with the turn\'s `at`, so lastTurn names WHEN', row && row.at)

    // ── the member's own session: a SECOND kernel over the SAME root, resolving its member through durable maps ──
    const km = await openKernel(root)
    await km.store.patch('member_sessions', () => [{ member: 'r-1', session: 'child-b-1' }])
    const spec = turnSpec(km)
    const mine = await asMember(spec, km, 'child-b-1', { op: 'status' })
    ok(mine.ok === true && !!mine.lastTurn && mine.lastTurn.id === row.turn,
      '★★★ §8d the member\'s own session reads its OWN last turn (id projected from the durable row)', { lastTurn: mine.lastTurn, row: row && row.turn })
    ok(!!mine.lastTurn && Array.isArray(mine.lastTurn.codes) && mine.lastTurn.codes.includes('VMU_TURN_UNKNOWN_FIELD'),
      '★★★ §8e …including `codes:["VMU_TURN_UNKNOWN_FIELD"]` — the exact fact run 75 could not read', mine.lastTurn)
    ok(!!mine.lastTurn && mine.lastTurn.status === 'failed' && typeof mine.lastTurn.at === 'string' &&
      mine.lastTurn.skipped === 0 && mine.lastTurn.emptyReply === null,
      '★★ §8f …and status/skipped/emptyReply/at, i.e. the whole named shape, not a subset', mine.lastTurn)
    ok(Array.isArray(mine.turns) && mine.turns.length === 0,
      '★★ §8g the member session still has NO in-memory turns of its own — lastTurn is the durable projection, not a local list', { turns: mine.turns })
    has(mine.lastTurnMeans, 'READ-ONLY', '★★ §8h lastTurnMeans says the reading is READ-ONLY')
    has(mine.lastTurnMeans, 'step/abandon/prompt', '★★ §8i …and names what the member still cannot do from here')

    const office = parse(await spec.execute({ op: 'status' }, {}))
    ok(!Object.prototype.hasOwnProperty.call(office, 'lastTurn'),
      '★★ §8j the office/agent-caller reading is unchanged: no lastTurn field (no pin drift for a caller that has no own turn)', Object.keys(office).filter((x) => x === 'lastTurn'))

    const deny = async (args) => (await asMember(spec, km, 'child-b-1', args)).code
    ok(await deny({ op: 'step', members: ['r-1'] }) === 'VMU_NOT_PERMITTED' &&
      await deny({ op: 'abandon', member: 'r-1' }) === 'VMU_NOT_PERMITTED' &&
      await deny({ op: 'prompt' }) === 'VMU_NOT_PERMITTED',
      '★★★ §8k read-only is enforced: step/abandon/prompt from the member face are still VMU_NOT_PERMITTED')

    const fresh = mkRoot(); roots.push(fresh)
    const kf = await openKernel(fresh)
    await kf.store.patch('member_sessions', () => [{ member: 'r-9', session: 'child-b-9' }])
    const none = await asMember(turnSpec(kf), kf, 'child-b-9', { op: 'status' })
    ok(Object.prototype.hasOwnProperty.call(none, 'lastTurn') && none.lastTurn === null,
      '★★★ §8l a member with no turn yet reads `lastTurn:null` — the key is present and the value is null (not an empty list)', { lastTurn: none.lastTurn })
  } finally {
    for (const r of roots) { try { rmSync(r, { recursive: true, force: true }) } catch { /* best effort */ } }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// §9 TB-2694 / E (F75-16): "archived" is only said after a READ-BACK, and a missing archive is NAMED.
// RUN 75 evidence: r-temp's self-test table existed ONLY inside the `t-15` receipt text; the file the prompt claimed
// had been written was never on disk, and no receipt slot could have said so. The contract tested here is the
// RECEIPT side only (the prompt sentence itself is prompt-a's file, see TB-2694 §E): when the write seam claims a
// file, the kernel must (a) read it back and match the digest, (b) publish replyFullPath/replyFullSha256 only on that
// evidence, and (c) carry a NAMED `archiveMissing` when the seam claimed a file that is not readable.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
{
  const mkRoot = () => mkdtempSync(join(tmpdir(), 'vmu-tb2694-e-'))
  const fence = (o) => ['```json', JSON.stringify(o), '```'].join('\n')
  const sha256 = (s) => createHash('sha256').update(s).digest('hex')
  const openKernel = async (root, extra) => {
    const k = createKernel(Object.assign({ root, clock: () => 1000, settings: {} }, extra))
    await k.store.open()
    return k
  }
  const rowOf = (k, member) => (Array.isArray(k.store.read('turns')) ? k.store.read('turns') : []).filter((r) => r && r.member === member).slice(-1)[0] || null
  // The ARCHIVE evidence (replyFullPath/Sha256/Bytes/archiveMissing) is a receipt-row fact, read through op:"status"
  // turnReceipts — the durable `turns` projection carries the settlement columns only (TB-2694 / F75-06).
  const receiptRow = (k, member) => {
    const st = k.turn.status(Object.assign({}, member ? { roster: [member] } : {}))
    return (Array.isArray(st && st.turnReceipts) ? st.turnReceipts : []).filter((r) => r && r.member === member).slice(-1)[0] || null
  }
  const roots = []
  try {
    // ── long reply ⇒ the seam archives it; the row must carry PATH + SHA + BYTES, and they must read back ──
    const root = mkRoot(); roots.push(root)
    const longBody = 'a'.repeat(4200)
    const rawLong = fence({ say: longBody, solved: false })
    const k = await openKernel(root, { deliverTurn: async () => ({ reply: rawLong, deliveryPath: 'fake-delegated' }) })
    await k.turn.run({ member: 'r-1', phase: 'normal', round: 1, role: 'researcher', roleLabel: '常驻研究员', why: 'tb2694/f75-16' })
    let row = receiptRow(k, 'r-1')
    for (let i = 0; i < 100 && (!row || row.status === 'open'); i += 1) { await new Promise((r) => setTimeout(r, 20)); row = receiptRow(k, 'r-1') }
    ok(!!row && row.status === 'applied', '★ §9a0 the turn settled as applied before the archive slots can mean anything', row && { status: row.status })
    ok(!!row && row.truncated === true, '★★ §9a a long reply is marked truncated (the archive case)', row && { truncated: row.truncated, len: row.excerptLen })
    ok(!!row && row.replyFullPath === 'Members/r-1/Turns/' + row.turn + '.md' && row.replyFullSha256 === sha256(rawLong) &&
      row.replyFullBytes === Buffer.byteLength(rawLong, 'utf8'),
      '★★★ §9b the archive claim is backed by PATH + SHA256 + BYTES taken from the file that was read back', row && { path: row.replyFullPath, sha: row.replyFullSha256, bytes: row.replyFullBytes })
    ok(!!row && !!rowOf(k, 'r-1') && rowOf(k, 'r-1').status === 'applied', '★ §9b0 the durable settlement the member reads agrees: status "applied"', rowOf(k, 'r-1') && rowOf(k, 'r-1').status)
    const abs = row && typeof row.replyFullPath === 'string' ? join(root, row.replyFullPath) : null
    let back = null
    try { back = abs === null ? null : readFileSync(abs, 'utf8') } catch { back = null }
    ok(back !== null && back.endsWith(rawLong) && sha256(back.slice(back.length - rawLong.length)) === (row && row.replyFullSha256),
      '★★★ §9c the claimed file EXISTS on disk and its body suffix hashes to the receipt\'s sha (read-back, not a promise)', { exists: back !== null, backBytes: back === null ? 0 : back.length })
    ok(!!row && row.archiveMissing === false && row.replyArchiveWhy === null,
      '★★ §9d the good case is NAMED explicitly: archiveMissing:false, replyArchiveWhy:null (no silent null)', row && { archiveMissing: row.archiveMissing, why: row.replyArchiveWhy })

    // ── the seam-contract source pins: the read-back and the named-missing verdict must exist in the kernel ──
    const kernSrc = readFileSync(new URL('../vibe-math-vmu/kernel/index.js', import.meta.url), 'utf8')
    const turnSrc = readFileSync(new URL('../vibe-math-vmu/kernel/turn/index.js', import.meta.url), 'utf8')
    has(kernSrc, 'readFileSync(target', '★★ §9e writeTurnArchive reads the file it just wrote (no write-only claim)')
    has(kernSrc, 'digestText(backText) !== replyDigest', '★★★ §9e2 …and compares the READ-BACK digest with the reply digest')
    has(kernSrc, 'archiveMissing: true', '★★★ §9e3 a read-back that fails is a NAMED archiveMissing verdict')
    has(turnSrc, 'archiveMissing: replyTruncated === true', '★★ §9e4 the row projects the verdict as its own boolean slot')

    // ── short reply ⇒ no archive claim at all (no phantom path), so nothing can be "missing" ──
    const shortRoot = mkRoot(); roots.push(shortRoot)
    const rawShort = fence({ say: 'ok', solved: false })
    const ks = await openKernel(shortRoot, { deliverTurn: async () => ({ reply: rawShort, deliveryPath: 'fake-delegated' }) })
    await ks.turn.run({ member: 'r-2', phase: 'normal', round: 1, role: 'researcher', roleLabel: '常驻研究员', why: 'tb2694/f75-16-short' })
    let rowS = receiptRow(ks, 'r-2')
    for (let i = 0; i < 100 && (!rowS || rowS.status === 'open'); i += 1) { await new Promise((r) => setTimeout(r, 20)); rowS = receiptRow(ks, 'r-2') }
    ok(!!rowS && rowS.truncated === false && rowS.replyFullPath === null && rowS.replyArchiveWhy === null && rowS.archiveMissing === null,
      '★★ §9f a short reply claims NO archive: no path, no why, and archiveMissing stays null (not decided ⇒ not false-alarm)', rowS && { truncated: rowS.truncated, path: rowS.replyFullPath, why: rowS.replyArchiveWhy, am: rowS.archiveMissing })
  } finally {
    for (const r of roots) { try { rmSync(r, { recursive: true, force: true }) } catch { /* best effort */ } }
  }
}

console.log('\n' + '─'.repeat(60))
if (failed === 0) {
  console.log('TB-2694 / F75-05 attend receipt budget: ' + passed + ' passed, 0 failed')
  console.log('RESULT: PASS')
} else {
  console.log('TB-2694 / F75-05 attend receipt budget: ' + passed + ' passed, ' + failed + ' failed')
  console.log('FAILURES:')
  for (const f of failures) console.log('  · ' + f)
  console.log('RESULT: FAIL')
  process.exitCode = 1
}
