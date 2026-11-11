// tests/vmu-run2735-mounted-facts-durable.test.mjs — RUN 79 / TB-2735: WHEN THE MOUNTED-TOOLS FACT IS GONE,
// SAY WHICH KIND OF GONE (legacy row / FIFO eviction / earlier process), AND COUNT NO VOTE IN ANY OF THEM.
//
// THE DEFECT THIS PINS (found while auditing TB-2730): `mountedToolsByTurn` is process memory with a 512-turn FIFO.
// After a restart, or after enough assemblies to evict the entry, a late reply's `vote_solved` fell into
// `keptWhy:"legacy-row"` — "this loop never assembled that turn". The fail-closed decision was right, but the CAUSE was
// wrong: the row was not an old row from another code path, it was a fact THIS loop had and then lost (eviction), or a
// fact that died with an earlier process (restart). A reader following `legacy-row` looks for older code that does not
// exist and burns a live-machine round.
//
// WHAT MAKES THE DISTINCTION PROVABLE: every loop stamps the durable `turns` row it writes with `loopEpoch`
// (`loop-<pid>-<seq>`). A reply carrying a turn id this loop did not assemble is classified from that durable row:
//   • durable row exists with another epoch  ⇒ `tool-visibility-unknown-after-restart` (the evidence died with the process)
//   • durable row is this epoch, the turn is in `turns`, and the FIFO removed its entry ⇒ `tool-visibility-evicted`
//   • neither fact exists ⇒ `legacy-row` (a bare row / a turn this loop opened but never assembled — nothing was lost)
//
// §0 the durable epoch and the two new keptWhy values are named shapes in the source
// §R a RESTARTED kernel cannot count a late reply vote, and says `unknown-after-restart` (not `legacy-row`)
// §E an EVICTED fact says `evicted`, says it was NOT a restart, and the newest turn still adopts
// §L the old names stay exact: invalid turn id ⇒ legacy-row, no turn id ⇒ the named compatibility path
// §M the durable ledger itself carries the epoch (one column, one reader, one writer)
//
// Run: node tests/vmu-run2735-mounted-facts-durable.test.mjs   Last line: N passed, M failed

import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createKernel } from '../vibe-math-vmu/kernel/index.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const TURN = join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')
const KERNEL = join(REPO, 'vibe-math-vmu', 'kernel', 'index.js')
const turnSource = readFileSync(TURN, 'utf8')
const kernelSource = readFileSync(KERNEL, 'utf8')

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
const section = (name) => console.log('\n' + name)
const J = (o) => JSON.stringify(o)

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r2735-')); roots.push(d); return d }
const FENCE = (obj) => ['```json', JSON.stringify(obj), '```'].join('\n')
const boot = async (extra = {}) => {
  const root = extra.root || await mkRoot()
  const k = createKernel(Object.assign({ root, clock: () => 1000, settings: {},
    deliverTurn: async () => ({ reply: FENCE({ progress: 'run2735 fixture' }), deliveryPath: 'fake-delegated' }) }, extra))
  await k.store.open()
  return { k, root }
}
const until = async (fn, ms = 3000) => {
  const t0 = Date.now()
  for (;;) {
    let v = null
    try { v = fn() } catch { v = null }
    if (v) return v
    if (Date.now() - t0 > ms) return null
    await new Promise((r) => setTimeout(r, 20))
  }
}
const openTurn = async (k, member) => {
  const opened = await k.turn.open({ member, role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', round: 1 })
  return opened.turn
}
const bookRow = (applied) => ((applied && applied.bookkeeping) || []).filter((b) => b && b.field === 'vote_solved')
const closureEffects = (applied) => ((applied && applied.effects) || []).filter((e) => e && e.kind === 'closure-vote')
const tallyOf = (k, member) => k.turn.status({ roster: [member], may: () => true }).closureVote

try {
  // ── §0 NAMED SHAPES ───────────────────────────────────────────────────────────────────────────────────────
  section('§0 the epoch and the two absences are named shapes in the source')
  ok(/let LOOP_EPOCH_SEQ = 0/.test(turnSource), '§0a the loop-epoch sequence is a module-level fact')
  ok(/const loopEpoch = 'loop-' \+ String\(typeof process !== 'undefined' && process && process\.pid/.test(turnSource) &&
     /String\(\+\+LOOP_EPOCH_SEQ\)/.test(turnSource),
    '§0b each orchestrator builds its own epoch from the pid AND a per-process counter (two instances in one process differ)')
  ok(turnSource.includes('const loopStartedAt = isoStampOf(clock())'),
    '§0c the human-readable start stamp comes from the injected clock, not a stray Date.now()')
  ok(turnSource.includes('const evictedTurnIds = new Set()') && turnSource.includes('evictedTurnIds.add(evicted)'),
    '§0d the FIFO records WHICH ids it removed (eviction is remembered, so it can be named)')
  ok(turnSource.includes("keptWhy: 'tool-visibility-unknown-after-restart'") && turnSource.includes("keptWhy: 'tool-visibility-evicted'"),
    '§0e the two new absences are named on the row, not squeezed into legacy-row')
  ok(turnSource.includes('turnLedger.epochOf(turnIdForVote)'),
    '§0f the classification reads durable evidence instead of inferring "restart" from an empty map')
  ok(kernelSource.includes('loopEpoch: typeof f.loopEpoch === \'string\' ? f.loopEpoch : null'),
    '§0g the durable row carries the epoch column')
  ok(kernelSource.includes('epochOf: (turnId) => {') && kernelSource.includes('return typeof r.loopEpoch === \'string\' ? r.loopEpoch : null'),
    '§0h and the ledger exposes the matching reader')
  ok(!/keptWhy: 'tool-visibility-unknown-after-restart'[\s\S]{0,400}keptWhy: 'tool-visibility-evicted'/.test(turnSource) === false ||
     turnSource.indexOf("keptWhy: 'tool-visibility-unknown-after-restart'") < turnSource.indexOf("keptWhy: 'tool-visibility-evicted'"),
    '§0i the restart branch is tested before eviction (an evicted id can never look like a restart first, source order)')

  // ── §R RESTART ──────────────────────────────────────────────────────────────────────────────────────────
  section('§R a RESTARTED kernel loses the fact with the process: `unknown-after-restart`, never a counted vote')
  {
    const { k: k1, root } = await boot()
    k1.turn.setVisibleToolsProvider(() => [])            // provable empty table — the adopting world, before the restart
    const turn = await openTurn(k1, 'r-1')
    const asm = await k1.turn.assemble(turn)
    const durableRow = await until(() => {
      const rows = k1.store.read('turns')
      if (!Array.isArray(rows)) return null
      const r = rows.find((x) => x && String(x.turn) === 't-1')
      return r && typeof r.loopEpoch === 'string' ? r : null
    })
    ok(asm.ok === true && durableRow !== null && /^loop-\d+-\d+$/.test(durableRow.loopEpoch),
      '§R0 the first kernel wrote t-1 to the durable ledger WITH its epoch', durableRow && { turn: durableRow.turn, loopEpoch: durableRow.loopEpoch })
    const epoch1 = durableRow && durableRow.loopEpoch

    // A second kernel over the SAME root is the restart shape: new loop, same durable facts.
    const { k: k2 } = await boot({ root })
    const applied = await k2.turn.apply({ vote_solved: true }, null, 'r-1', { turnId: 't-1' })
    const rows = bookRow(applied)
    ok(rows.length === 1 && rows[0].kept === false && rows[0].keptWhy === 'tool-visibility-unknown-after-restart',
      '§R1 the late reply vote is NOT kept, and the row says the fact died with an EARLIER process', rows)
    ok(typeof rows[0].reason === 'string' && rows[0].reason.includes('EARLIER kernel process') && rows[0].reason.includes(String(epoch1)),
      '§R2 the reason names the old epoch as the evidence (the reader can see why this is not a legacy row)')
    ok(closureEffects(applied).length === 0, '§R3 no ghost closure-vote effect was produced')
    const tally = tallyOf(k2, 'r-1')
    ok(tally && tally.votesCast === 0 && J(tally.for) === J([]),
      '§R4 the restarted kernel counts nothing (fail-closed stayed fail-closed)', tally && { votesCast: tally.votesCast, for: tally.for })
    ok(tally && J(tally.notEligible.map((e) => (e && typeof e === 'object' ? e.member : e))) === J([]),
      '§R5 and the member is not silently relabelled as "not eligible" — this is an UNPROVABLE fact, not a permission fact', tally && tally.notEligible)
  }

  // ── §E EVICTION ─────────────────────────────────────────────────────────────────────────────────────────
  section('§E a FIFO-evicted fact says `evicted` (and NOT a restart), while the newest turn still adopts')
  {
    const { k } = await boot()
    k.turn.setVisibleToolsProvider(() => [])
    const first = await openTurn(k, 'r-1')
    await k.turn.assemble(first)
    // The cap is 512 turns; assembling 512 MORE turns pushes t-1 out. (Ids are minted t-1, t-2, …)
    let last = null
    for (let i = 0; i < 512; i++) { const t = await openTurn(k, 'r-1'); await k.turn.assemble(t); last = t }
    const appliedOld = await k.turn.apply({ vote_solved: true }, null, 'r-1', { turnId: 't-1' })
    const rowsOld = bookRow(appliedOld)
    ok(rowsOld.length === 1 && rowsOld[0].kept === false && rowsOld[0].keptWhy === 'tool-visibility-evicted',
      '§E1 the evicted turn is named `evicted`, not `legacy-row` and not `unknown-after-restart`', rowsOld)
    ok(typeof rowsOld[0].reason === 'string' && rowsOld[0].reason.includes('FIFO eviction, NOT a restart') && rowsOld[0].reason.includes('512'),
      '§E2 the reason says it WAS assembled here and that the cause is the cap (the remedy is a different one)')
    ok(closureEffects(appliedOld).length === 0, '§E3 an evicted fact still counts no vote')
    // control: the newest turn is still provable and still adopts — eviction does not poison the whole gate.
    const appliedNew = await k.turn.apply({ vote_solved: true }, null, 'r-1', { turnId: last.id })
    const rowsNew = bookRow(appliedNew)
    ok(rowsNew.length === 1 && rowsNew[0].kept === true && rowsNew[0].keptWhy === 'tool-not-mounted' && closureEffects(appliedNew).length === 1,
      '§E4 the newest turn (still in the table) is provable and ADOPTS — eviction is local, not a global downgrade', rowsNew)
  }

  // ── §L OLD NAMES STAY EXACT ─────────────────────────────────────────────────────────────────────────────
  section('§L legacy-row keeps its old meaning, and the compatibility path is still named')
  {
    const { k } = await boot()
    const bad = await k.turn.apply({ vote_solved: true }, null, 'r-1', { turnId: 'not-a-turn' })
    const rows = bookRow(bad)
    ok(rows.length === 1 && rows[0].kept === false && rows[0].keptWhy === 'legacy-row',
      '§L1 an id that is not a turn id is a bare row ⇒ legacy-row (no epoch evidence is invented)', rows)
    const compat = await k.turn.apply({ vote_solved: true }, null, 'r-temp')
    const crows = bookRow(compat)
    ok(crows.length === 1 && crows[0].kept === true && crows[0].keptWhy === 'no-turn-row-compat',
      '§L2 an apply() with NO turn id keeps the named pre-2730 rule (the tool/direct path)', crows)
  }

  // ── §M ONE COLUMN, ONE WRITER, ONE READER ──────────────────────────────────────────────────────────────
  section('§M the durable ledger is where the epoch lives (not a second in-memory table)')
  {
    const { k } = await boot()
    const turn = await openTurn(k, 'r-1')
    await k.turn.assemble(turn)
    const row = await until(() => {
      const rows = k.store.read('turns')
      return Array.isArray(rows) ? rows.find((x) => x && String(x.turn) === 't-1') || null : null
    })
    ok(row && typeof row.loopEpoch === 'string' && /^loop-\d+-\d+$/.test(row.loopEpoch),
      '§M1 a settled turn row carries the epoch (the vote gate reads the SAME fact every other reader reads)')
    ok(row && row.turn === 't-1' && typeof row.member === 'string',
      '§M2 the epoch column did not displace the row contract (turn/member still there)', row && { turn: row.turn, member: row.member })
  }
} finally {
  for (const r of roots) { try { await rm(r, { recursive: true, force: true }) } catch { /* best effort */ } }
}

console.log(passed + ' passed, ' + failed + ' failed')
if (failed > 0) {
  console.error('FAILURES:')
  for (const f of failures) console.error(' - ' + f)
  process.exitCode = 1
}
