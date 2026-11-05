// tests/vmu-run240-wait-opener.test.mjs — RUN 240: A TURN OPENED BY A WAKE MUST SAY SO.
//
// THE MEASURED GAP (run 63 / FEEDBACK63 ①4, second half): RUN 239-D made `vmu.meetings.wait` real — a member can ask to
// be woken, the event fires, a wake is delivered — and RUN 240-A gave every turn a ledger row carrying `openedBy`
// ('drive' | 'activation' | 'wait'). But the FALLBACK wake transport (the one a deployment with no member-delivery
// transport actually uses) opened its round with `turn.drive({ members: [target], rounds: 1, why: ask })` and no
// `openedBy`, so the loop wrote 'drive': the row said the office started that turn, when in fact the turn started
// itself because an event the member had WAITED FOR happened. The label existed and the fact was available; the two
// were never connected.
//
// WHAT THIS SUITE DOES: it does not read source to believe a label. It boots the real kernel through the real entry,
// founds the institute, convenes a meeting, arms a real wait, fires it with a real speech, and then reads the ledger row
// the loop wrote for the woken seat. The row must say `openedBy: "wait"`. A control turn opened by an explicit drive
// must still say `drive` — otherwise a suite that only checked "wait" would pass on a loop that wrote the word always.
//
// Run: node tests/vmu-run240-wait-opener.test.mjs   (last line: === VMU RUN 240 WAIT OPENER: N passed, M failed ===)

import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ENTRY = join(HERE, '..', 'vibe-math-vmu', 'vibe-math-vmu.js')
const NL = String.fromCharCode(10)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; failures.push(label); console.log('  FAIL ' + label + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 300) + ']')) }
}

const fence = (obj) => ['```json', JSON.stringify(obj), '```'].join(NL)
const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r240wo-')); roots.push(d); return d }
let diag = ''

try {
  const entry = await import(pathToFileURL(ENTRY).href)

  // ── 0. SOURCE PINS: the label has ONE producer on the wake path, and no producer that drops it ──────────────
  {
    const src = await readFile(join(HERE, '..', 'vibe-math-vmu', 'kernel', 'index.js'), 'utf8')
    // ★ RUN 241: the transport now also carries the MEETING the waiter was born in (run 64 opened a woken turn with
    // meeting null while its waiter hung on m1), and the wake is queued when the loop is busy. The invariant this pin
    // exists for is unchanged: the wake drive NAMES its door.
    ok(/loop\.drive\(\{ members: \[target\], rounds: 1, why: ask, openedBy: 'wait', meeting: wakeMeeting \}\)/.test(src),
      '§0a the FALLBACK wake transport names its door: the drive it opens passes openedBy:"wait" (and RUN 241 adds its meeting)')
    ok(!/loop\.drive\(\{ members: \[target\], rounds: 1, why: ask \}\)/.test(src),
      '§0b and it is not ALSO still called without the label (one call site, one wording)')
  }

  const state = { specs: [], envelopes: [] }
  const ctx = {
    effect (fn) { return fn() },
    on () { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const root = await mkRoot()
  const handle = entry.apply(ctx, {
    clock: () => 1000, packs: ['v5r'], root, deliverMode: 'caller',
    // A member DELIVERY transport exists but is NOT the channel a wake may use as a report row; the wake must go
    // through the turn loop's own fallback (that is the code path this suite grades).
    deliver: async (envelope) => { state.envelopes.push(envelope); return { ok: true, delivered: true } },
  })
  await handle.ready()
  await handle.kernel.store.open()
  const K = handle.kernel
  const call = async (name, args = {}, as = null) => {
    const spec = state.specs.filter((s) => s && s.name === name)[0] || null
    if (!spec) return { ok: false, tool: name, code: 'NO_SUCH_TOOL' }
    const exec = as === null ? { kernel: K } : { kernel: K, agent: { id: as } }
    try {
      const raw = await spec.execute(args, exec)
      return typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch (e) {
      return { ok: false, code: (e && e.code) || null, message: String((e && e.message) || e) }
    }
  }

  // ── 1. A STAFFED INSTITUTE, AND A FREE LOOP ─────────────────────────────────────────────────────────────────
  const started = await call('vibe_v5_start', { problem: 'run240 wait opener probe', researcherCount: 2 })
  ok(started && started.ok === true, '§1a the institute starts', { code: started && started.code, message: started && started.message })
  diag = JSON.stringify({ start: started && started.code }).slice(0, 200)

  await K.turn.step({ members: ['r-acad'], phase: 'normal', why: 'run240 wait opener probe (chair turn)' })
  await K.turn.supplyMemberReply(fence({ say: '主席回合到此结束。' }), 'r-acad')
  await K.turn.step({ members: ['r-acad'], phase: 'normal', why: 'run240 wait opener probe (apply chair reply)' })
  ok(K.turn.awaitingCaller() === false,
    '§1b the caller-played loop is FREE (a parked prompt would refuse the wake, and then no turn row exists to grade)',
    { awaitingCaller: K.turn.awaitingCaller() })

  // ── 2. A MEETING, A REAL WAIT, A REAL EVENT ────────────────────────────────────────────────────────────────
  const opened = await call('vibe_v5_meeting', { member: 'r-acad', agenda: ['确认命题'], title: 'run240 wait opener 会议' })
  const mid = opened && (typeof opened.meeting === 'string' ? opened.meeting : opened.meeting && opened.meeting.id)
  ok(typeof mid === 'string' && mid !== '', '§2a a meeting is convened to wait on', { code: opened && opened.code, message: opened && opened.message, keys: opened && Object.keys(opened).slice(0, 10) })

  const armed = await call('vibe_vmu_meeting', { action: 'wait', id: mid, member: 'r-1', until: 'speak' })
  ok(armed && armed.ok === true, '§2b a member arms an event wait (RUN 239-D mechanism)', { code: armed && armed.code, message: armed && armed.message })

  const spoke = await call('vibe_vmu_meeting', { action: 'speak', id: mid, member: 'r-acad', text: '开场：主席发言就是 r-1 等的事件' })
  ok(spoke && spoke.ok === true, '§2c the chair speaks there (the event)', { code: spoke && spoke.code, message: spoke && spoke.message })
  const fired = Array.isArray(spoke && spoke.firedWaiters) ? spoke.firedWaiters : []
  ok(fired.length === 1 && String(fired[0].member) === 'r-1', '§2d the waiter fires', { fired })
  await new Promise((r) => setTimeout(r, 150))
  const sum = K.meetings.summary({ meeting: mid })
  const waiters = Array.isArray(sum && sum.waiters) ? sum.waiters : []
  ok(waiters.length === 1 && waiters[0].state === 'fired' && waiters[0].wake && waiters[0].wake.woken === true,
    '§2e ★ the wake really happened (the seat\'s turn was run through the loop fallback)', { waiters })
  ok(state.envelopes.length === 0, '§2f ★ the REPORT transport was not used as the wake channel', { envelopes: state.envelopes.length })

  // ── 3. THE LEDGER ROW THE LOOP WROTE FOR THAT WAKE ─────────────────────────────────────────────────────────
  const st = K.turn.status()
  const rows = Array.isArray(st.turnReceipts) ? st.turnReceipts : []
  ok(rows.length >= 2, '§3a the loop keeps a per-turn ledger (RUN 240-A)', { rows: rows.length })
  const wakeRow = rows.filter((r) => String(r && r.member) === 'r-1' && String(r && r.openedBy) === 'wait')[0] || null
  ok(wakeRow !== null,
    '§3b ★★★ the turn opened BY THE WAKE names its door: a row for r-1 carries openedBy:"wait" — the office can now tell a turn it started from one that started itself',
    { rows: rows.map((r) => ({ turn: r.turn, member: r.member, openedBy: r.openedBy, phase: r.phase, status: r.status })) })
  ok(wakeRow !== null && wakeRow.phase !== null && wakeRow.phase !== undefined && String(wakeRow.phase) !== '',
    '§3c and the row is a whole row (phase recorded), not a label bolted onto an empty line',
    { row: wakeRow })

  // ── 4. CONTROL: ANOTHER DOOR STILL SAYS ITS OWN NAME ───────────────────────────────────────────────────────
  await K.turn.supplyMemberReply(fence({ say: '被唤醒的回合到此结束。' }), 'r-1')
  await K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run240 wait opener probe (apply woken reply)' })
  const driven = await K.turn.drive({ members: [{ id: 'r-2' }], rounds: 1, why: 'control: the office starts this one' })
  ok(driven && driven.ok !== false, '§4a a plain drive still runs', { code: driven && driven.code, message: driven && driven.message })
  const rows2 = Array.isArray(K.turn.status().turnReceipts) ? K.turn.status().turnReceipts : []
  const driveRow = rows2.filter((r) => String(r && r.member) === 'r-2' && String(r && r.openedBy) === 'drive')[0] || null
  ok(driveRow !== null,
    '§4b ★★ and it says "drive": the label is a FACT about the door, not a constant (a suite that only checked "wait" would pass on a loop that always wrote it)',
    { rows: rows2.map((r) => ({ turn: r.turn, member: r.member, openedBy: r.openedBy })) })

  try { handle.kernel.store.close && handle.kernel.store.close() } catch { /* ignore */ }
} catch (e) {
  ok(false, 'the suite itself ran without throwing', { error: String((e && e.message) || e), diag })
} finally {
  for (const r of roots) { try { await rm(r, { recursive: true, force: true }) } catch { /* best effort */ } }
}

console.log('')
console.log('=== VMU RUN 240 WAIT OPENER: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f) }
process.exitCode = failed > 0 ? 1 : 0
