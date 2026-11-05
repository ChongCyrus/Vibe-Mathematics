// tests/vmu-run240-roster-recover.test.mjs — RUN 240: A RESTORE DELETED SEATS, AND TWO REFUSALS FORGOT WHAT
// THEY KNEW.
//
// THE MEASURED DEFECTS (found by scripts/sim/audit/all.mjs + a probe, not by reading code):
//   1. `vibe_vmu_human { action: "recover" }` CUT THE ROSTER. A two-researcher institute went in with
//      ["r-acad","r-1","r-2"] and came back with ["r-acad"]. Two layers were needed to explain it:
//        (a) kernel/index.js attached the `members` projection ONLY when `vmu.resume.projections` named it, so a
//            deployment that did not name it got every hire kept IN MEMORY while the durable `members` key stayed at
//            the snapshot written at creation (the chair alone);
//        (b) the recovery's hydrate step called `members.restore(snapshot, { replace: true })`, which replaces the
//            roster with that stale snapshot — a READ destroying state.
//      Both are fixed: the projection is attached unconditionally (the seat list is what a restart must not lose)
//      and `restore` keeps live seats the snapshot does not know about unless the caller asks `{ dropLive: true }`.
//   2. `vibe_vmu_human { action: "readBack" }` answered `ok:false, code:"VMU_RESUME_READBACK_DRIFT"` with NO message
//      and NO hint, and the face overwrote `ok` to `true` on the way out. The two facts that decide what a drift
//      MEANS (`writesBetween`, `driftMeans`) were already on the receipt; a reader just could not act on it.
//   3. `vibe_vmu_human { action: "recover" }` reported a partial recovery as `ok:false` with no code, no message and
//      no hint — this face is the only place a caller reads the report's own steps.
//
// WHAT THIS SUITE DOES: it founds a real institute through the real entry, reads the durable `members` key, runs a
// real recovery, and requires the roster to survive. It drives the drift path end to end (a tracked write, then a
// second writer moving the same key) and requires a named refusal that says what to do next. The restore contract is
// graded directly on `kernel.members.restore`, including the opt-in that still allows deletion.
//
// Run: node tests/vmu-run240-roster-recover.test.mjs   (last line: === VMU RUN 240 ROSTER RECOVER: N passed, M failed ===)

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const HARNESS = join(REPO, 'scripts', 'sim', 'harness.mjs')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; failures.push(label); console.log('  FAIL ' + label + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 300) + ']')) }
}
const codeOf = (r) => (r && (r.code || (r.failure && r.failure.code))) || null
const textOf = (r) => String((r && (r.message || r.hint)) || '')

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r240rr-')); roots.push(d); return d }
let diag = ''

try {
  // ── 0. SOURCE PINS ──────────────────────────────────────────────────────────────────────────────────────────
  {
    const src = await readFile(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js'), 'utf8')
    ok(/typeof members\.snapshot === 'function'[\s\S]{0,240}!attachedProjections\.some\(\(a\) => a && a\.key === 'members' && a\.attached\)/.test(src),
      '§0a the members projection is attached when it is NOT already attached (it used to wait for a declaration)')
    ok(/key: 'members', mode: 'state', snapshot: \(\) => members\.snapshot\(\)/.test(src),
      '§0b and it is a state projection of the live roster')
    ok(/restore: \(v\) => members\.restore\(v, \{ replace: true \}\)/.test(src),
      '§0c the adapter restores through the kernel members service')
    ok(/the seat list is what a restart must not lose/.test(src),
      '§0d the attach records WHY (a projection attached without a reason is the defect this round removed)')
  }
  {
    const src = await readFile(join(REPO, 'vibe-math-vmu', 'kernel', 'members.js'), 'utf8')
    ok(/dropLive = false/.test(src), '§0e restore takes an explicit `dropLive` (deletion is opt-in, not the default)')
    ok(/keptLive/.test(src) && /a restore is a statement about what was PERSISTED/.test(src),
      '§0f the receipt names the seats it kept and says why a restore may not delete them')
    ok(!/live rows are DROPPED/.test(src), '§0g the old doc line that promised live rows are dropped on replace is gone')
  }
  {
    const src = await readFile(join(REPO, 'vibe-math-vmu', 'tools', 'human.js'), 'utf8')
    ok(/out\.failedSteps = bad\.map/.test(src), '§0h a partial recovery names the failed steps')
    ok(/out\.driftKeys = keys/.test(src), '§0i a read-back drift names the keys that moved')
    ok(/do NOT rewrite the key to make the digest agree/.test(src),
      '§0j and the drift hint forbids the one fix that destroys the other writer fact')
    ok(/ok: rb\.ok !== false/.test(src), '§0k the face no longer overwrites ok to true on a failed read-back')
  }

  // ── 1. A REAL INSTITUTE WRITES ITS SEATS THROUGH ────────────────────────────────────────────────────────────
  const { boot } = await import(pathToFileURL(HARNESS).href)
  const root = await mkRoot()
  const h = await boot({ root, clock: () => 1000000, withPrompt: false, settings: { 'vmu.tools.faces': ['human'] } })
  const K = h.kernel
  const call = (name, args = {}, as = 'r-acad') => h.call(name, args, { as: as === null ? null : { agent: { id: as } } })

  const started = await call('vibe_v5_start', { problem: 'run240 roster recover probe', researcherCount: 2 })
  ok(started && started.ok === true, '§1a a staffed institute exists (fixture precondition)', { code: codeOf(started), message: started && started.message })
  const rosterBefore = K.members.roster().map((m) => m.id)
  ok(rosterBefore.length === 3 && rosterBefore.indexOf('r-1') >= 0 && rosterBefore.indexOf('r-2') >= 0,
    '§1b three seats are live before the recovery', rosterBefore)

  // The write-through is DEBOUNCED on purpose (a tool call must never wait on disk). `flushAll()` alone does not
  // drain it -- measured: the durable key still held the founding snapshot right after the flush and carried all
  // three seats 300 ms later. So this suite WAITS FOR THE FACT instead of guessing a sleep: poll the durable value.
  const durableOf = () => { const e = K.store.read('members'); return e && e.value && e.value.data && Array.isArray(e.value.data.members) ? e.value : null }
  let env = null
  for (let i = 0; i < 40; i += 1) {
    env = durableOf()
    if (env && env.data.members.length >= 3) break
    await new Promise((r) => setTimeout(r, 50))
  }
  // the durable envelope is { v, mode, key, seq, value, digest, ... }; the poll above already unwrapped `value`
  const snap = env
  const durableIds = snap && snap.data && Array.isArray(snap.data.members) ? snap.data.members.map((m) => m.id) : []
  ok(durableIds.length === 3,
    '§1c ★ the durable `members` key carries all three seats (it used to stay at the creation snapshot, chair only)',
    { durableIds })
  ok(snap && snap.counters && snap.counters.member >= 1,
    '§1d and the member counter moved with them (an id would otherwise restart at 1)', snap && snap.counters)
  diag = JSON.stringify({ durableIds })

  // ── 2. THE RECOVERY MUST NOT DELETE SEATS ───────────────────────────────────────────────────────────────────
  const recovered = await call('vibe_vmu_human', { action: 'recover', reason: 'run240: prove the roster survives' })
  const rosterAfter = K.members.roster().map((m) => m.id)
  ok(recovered && recovered.ok === true, '§2a the recovery runs', { code: codeOf(recovered), message: textOf(recovered).slice(0, 120) })
  ok(rosterAfter.length === 3 && rosterAfter.indexOf('r-1') >= 0 && rosterAfter.indexOf('r-2') >= 0,
    '§2b ★★ the roster is UNCHANGED by the recovery (it used to be cut down to the chair)',
    { before: rosterBefore, after: rosterAfter })
  const hydrateStep = recovered && recovered.recovery && Array.isArray(recovered.recovery.steps)
    ? recovered.recovery.steps.filter((s) => s && s.step === 'hydrate')[0] : null
  ok(hydrateStep === undefined || hydrateStep.ok === true,
    '§2c the hydrate step is not a silent failure', hydrateStep && hydrateStep.code)

  // ── 3. THE RESTORE CONTRACT ITSELF: KEEP BY DEFAULT, DELETE ON REQUEST ─────────────────────────────────────
  const stale = { apiVersion: 1, face: 'members', v: 1, at: 1000000,
    data: { members: [{ id: 'r-acad', slot: 'chair', state: 'live', since: 1000000, wakes: 0 }], reportLog: [] },
    counters: { member: 0 }, skipped: [] }
  const kept = K.members.restore(stale, { replace: true })
  const afterKeep = K.members.roster().map((m) => m.id)
  ok(afterKeep.length === 3 && Array.isArray(kept.keptLive) && kept.keptLive.length === 2,
    '§3a ★ a replacing restore KEEPS the two live seats the snapshot does not know about',
    { roster: afterKeep, keptLive: kept && kept.keptLive })
  ok(typeof kept.keptLiveMeans === 'string' && kept.keptLiveMeans.indexOf('PERSISTED') >= 0,
    '§3b and says that a restore is a statement about what was persisted, not about who left',
    String(kept && kept.keptLiveMeans).slice(0, 120))
  const ended = K.members.end ? null : null
  const dropped = K.members.restore(stale, { replace: true, dropLive: true })
  const afterDrop = K.members.roster().map((m) => m.id)
  ok(afterDrop.length === 1 && afterDrop[0] === 'r-acad',
    '§3c the opt-in `{ dropLive: true }` still allows a real deletion (the guard is a door, not a wall)',
    { roster: afterDrop, ended })
  ok(dropped && Array.isArray(dropped.keptLive) && dropped.keptLive.length === 0,
    '§3d and it reports that it kept nothing', dropped && dropped.keptLive)

  // ── 4. A DRIFT MUST SAY WHAT MOVED AND WHAT TO DO ──────────────────────────────────────────────────────────
  const tracked = await K.recovery.write('work', { v: 1, holder: 'this-process' })
  ok(tracked && tracked.ok === true, '§4a this process wrote a durable key and holds its digest', tracked)
  await K.store.patch('work', () => ({ v: 1, holder: 'somebody-else' }))
  const drift = await call('vibe_vmu_human', { action: 'readBack' })
  ok(drift && drift.ok === false && codeOf(drift) === 'VMU_RESUME_READBACK_DRIFT',
    '§4b ★ a moved key refuses BY NAME (and the face no longer rewrites ok to true)', { code: codeOf(drift), ok: drift && drift.ok })
  ok(textOf(drift).length > 20, '§4c ★★ the refusal carries a message (it used to be empty)', { textOf: textOf(drift).slice(0, 120) })
  ok(typeof drift.hint === 'string' && drift.hint.length > 20,
    '§4d ★★ and a hint — audit A4: a named refusal says what to do next', String(drift && drift.hint).slice(0, 110))
  ok(Array.isArray(drift.driftKeys) && drift.driftKeys.indexOf('work') >= 0,
    '§4e the receipt names the key(s) that moved', drift && drift.driftKeys)
  ok(drift.writesBetween !== undefined && drift.driftMeans !== undefined,
    '§4f the two facts that decide what a drift MEANS are on the same receipt',
    { writesBetween: drift && drift.writesBetween, means: String(drift && drift.driftMeans).slice(0, 80) })
} catch (e) {
  failed += 1
  failures.push('suite threw')
  console.log('  FAIL suite threw: ' + String((e && e.stack) || e).split(String.fromCharCode(10)).slice(0, 4).join(' | '))
} finally {
  for (const r of roots) { try { await rm(r, { recursive: true, force: true }) } catch { /* best effort */ } }
}

console.log(String.fromCharCode(10) + '=== VMU RUN 240 ROSTER RECOVER: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.log('failures:'); for (const f of failures) console.log('  - ' + f); console.log('diag: ' + diag) }
process.exitCode = failed ? 1 : 0
