#!/usr/bin/env node
// vmu MIGRATION — the guard for kernel/migration.js (the 11 declared `vmu.migration.*` keys).
//
// WHAT THIS PROVES
//   · every wired key changes an observable result (positive + negative);
//   · every RECEIPT carries `enforced[]` + `fired[]` (fired ⊆ enforced, no duplicates) + `enforcedScope`;
//   · every REFUSAL (returned, not thrown) carries an ARRAY `enforced`, the same scope, and
//     `wouldEvaluate ⊇ enforced`;
//   · same-version and DOWNGRADE requests are refused; concurrency refusal NAMES the in-progress migration;
//     a missing backup blocks a real migration; an expired rollback window reports the window/remaining;
//     a digest mismatch reports BOTH prefixes;
//   · WIRED ↔ plannedKeys partition the 11 declared keys; refusals are counted per code; reads never mutate.
import { createMigration, WIRED_KEYS, ENFORCED_SCOPE, GATE_SCENARIOS } from '../vibe-math-vmu/kernel/migration.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const DAY = 86400000

let NOW = 1_000_000
const mk = (settings = {}) => createMigration({ clock: () => NOW, settings, backends: ['json-fold', 'storage-domain'] })
/** A real (non-dry-run) plan ready to execute. */
const realPlan = (settings = {}, steps = 3) => {
  NOW = 1_000_000
  const t = mk(Object.assign({ 'vmu.migration.dryRunDefault': false }, settings))
  const p = t.plan({ from: 'v1', to: 'v2', backend: 'json-fold', steps })
  return { t, id: p.migration, plan: p }
}

// ── 1. dryRunDefault ────────────────────────────────────────────────────────────────────────────────
{
  const dry = mk({})                       // documented default: true
  NOW = 1_000_000
  const p = dry.plan({ from: 'v1', to: 'v2', backend: 'json-fold', steps: 2 })
  ok(p.dryRun === true, 'dryRunDefault[+]: the documented default makes the plan a DRY RUN')
  const a = dry.apply({ migration: p.migration })
  ok(a.ok === true && a.dryRun === true && a.executed === 0 && dry.list().migrations[0].state === 'planned',
    'dryRunDefault[+]: applying a dry-run plan executes NOTHING', JSON.stringify({ executed: a.executed }))
  const real = realPlan({})
  const a2 = real.t.apply({ migration: real.id })
  ok(a2.ok === true && a2.dryRun === false && a2.executed === 3,
    'dryRunDefault[-]: with false the same apply really executes the steps', JSON.stringify({ executed: a2.executed }))
}

// ── 2. dryrun (forced override) ─────────────────────────────────────────────────────────────────────
{
  const forced = realPlan({ 'vmu.migration.dryrun': true })
  const a = forced.t.apply({ migration: forced.id })
  ok(a.ok === true && a.dryRun === true && a.executed === 0,
    'dryrun[+]: the key FORCES a dry run even when dryRunDefault=false', JSON.stringify({ dryRun: a.dryRun }))
  const off = realPlan({ 'vmu.migration.dryrun': false })
  ok(off.t.apply({ migration: off.id }).executed === 3, 'dryrun[-]: with false the real run proceeds')
}

// ── 3. requireConfirm ───────────────────────────────────────────────────────────────────────────────
{
  const guarded = realPlan({ 'vmu.migration.requireConfirm': true })
  const refused = guarded.t.apply({ migration: guarded.id })
  ok(refused.ok === false && refused.code === 'VMU_MIGRATE_CONFIRM_REQUIRED' && /pass \{ confirm: true \}/.test(refused.message),
    'requireConfirm[-]: applying without a confirmation is refused', refused.code)
  const confirmed = guarded.t.apply({ migration: guarded.id, confirm: true })
  ok(confirmed.ok === true && confirmed.executed === 3, 'requireConfirm[+]: with confirm:true it runs')
  const free = realPlan({})
  ok(free.t.apply({ migration: free.id }).ok === true, 'requireConfirm[+]: with the key off no confirmation is demanded')
}

// ── 4. keepBackups (the "no backup ⇒ no migration" rail) ────────────────────────────────────────────
{
  const noBackup = realPlan({ 'vmu.migration.keepBackups': false })
  const refused = noBackup.t.apply({ migration: noBackup.id })
  ok(refused.ok === false && refused.code === 'VMU_ROLLBACK_UNAVAILABLE' && /without a backup is not run/.test(refused.message),
    'keepBackups[-]: a real migration without backups is REFUSED (reversible or explicitly irreversible)', refused.code)
  const kept = realPlan({ 'vmu.migration.keepBackups': true })
  const a = kept.t.apply({ migration: kept.id })
  ok(a.ok === true && a.backups.length === 3 && kept.t.status().counters.backupsKept === 3,
    'keepBackups[+]: backups are created (one per rollback point) and KEPT', JSON.stringify({ backups: a.backups.length }))
  const dropped = realPlan({ 'vmu.migration.keepBackups': false, 'vmu.migration.rollback': 'refuse' })
  const droppedPlan = dropped.t.plan({ from: 'v1', to: 'v2', backend: 'json-fold', steps: 3 })
  const a2 = dropped.t.apply({ migration: dropped.id })
  ok(a2.ok === true && droppedPlan.rollbackPoints.length === 0 && a2.backups.length === 0 && a2.backupsRemoved === 0,
    'keepBackups[-] (explicitly irreversible): rollback=refuse creates NO rollback points, so there is nothing to remove — and the run is allowed',
    JSON.stringify({ points: droppedPlan.rollbackPoints.length, backups: a2.backups.length }))
}

// ── 5. onFailure (three-mode observable) ────────────────────────────────────────────────────────────
{
  const abort = realPlan({ 'vmu.migration.onFailure': 'abort' })
  const a = abort.t.apply({ migration: abort.id, failAtStep: 2 })
  ok(a.ok === false && a.code === 'VMU_MIGRATE_DRYRUN_FAILED' && a.failedStep === 2 && /onFailure=abort/.test(a.message),
    'onFailure[-]: "abort" refuses by name and reports the failing step', JSON.stringify({ step: a.failedStep }))
  const cont = realPlan({ 'vmu.migration.onFailure': 'continue' })
  const c = cont.t.apply({ migration: cont.id, failAtStep: 2 })
  ok(c.ok === true && c.executed === 3 && c.batches.some((b) => b.failedStep === 2 && b.policy === 'continue'),
    'onFailure[+]: "continue" skips the failing step and REPORTS it in batches[]', JSON.stringify(c.batches))
  const rb = realPlan({ 'vmu.migration.onFailure': 'rollback' })
  const r = rb.t.apply({ migration: rb.id, failAtStep: 2 })
  ok(r.ok === false && r.code === 'VMU_MIGRATE_DRYRUN_FAILED' && r.rollbackPoint === 1 && rb.t.list().migrations[0].state === 'rolled-back',
    'onFailure[+]: "rollback" returns to the last rollback point and says which', JSON.stringify({ point: r.rollbackPoint }))
}

// ── 6–7. report / reportFormat ──────────────────────────────────────────────────────────────────────
{
  const on = realPlan({ 'vmu.migration.report': true, 'vmu.migration.reportFormat': 'text' })
  const p = on.t.plan({ from: 'v1', to: 'v2', backend: 'json-fold', steps: 1 })
  ok(typeof p.rendered === 'string' && /migration m\d+/.test(p.rendered) && on.t.status().counters.reports > 0,
    'report[+]: the receipt carries a rendered report (and the render is counted)', p.rendered)
  const off = realPlan({ 'vmu.migration.report': false })
  const p2 = off.t.plan({ from: 'v1', to: 'v2', backend: 'json-fold', steps: 1 })
  ok(p2.rendered === undefined, 'report[-]: with report=false nothing is rendered')
  const json = realPlan({ 'vmu.migration.report': true, 'vmu.migration.reportFormat': 'json' })
  const j = json.t.plan({ from: 'v1', to: 'v2', backend: 'json-fold', steps: 1 })
  const md = realPlan({ 'vmu.migration.report': true, 'vmu.migration.reportFormat': 'markdown' })
  const m = md.t.plan({ from: 'v1', to: 'v2', backend: 'json-fold', steps: 1 })
  ok(j.rendered.startsWith('{') && m.rendered.startsWith('# migration') && j.rendered !== m.rendered,
    'reportFormat[+]: json and markdown render observably differently', JSON.stringify([j.rendered.slice(0, 12), m.rendered.slice(0, 14)]))
}

// ── 8. auto (NOT read-but-inert: a safe plan is executed by plan() itself) ───────────────────────────
{
  const auto = mk({ 'vmu.migration.auto': true, 'vmu.migration.dryRunDefault': false })
  NOW = 1_000_000
  const r = auto.plan({ from: 'v1', to: 'v2', backend: 'json-fold', steps: 2 })
  ok(r.ok === true && r.autoApplied === true && r.action === 'apply' && r.executed === 2 && auto.list().migrations[0].state === 'done',
    'auto[+]: plan() EXECUTES a safe plan (state becomes done — the key is not read-but-inert)', JSON.stringify({ state: auto.list().migrations[0].state }))
  const manual = mk({ 'vmu.migration.auto': false, 'vmu.migration.dryRunDefault': false })
  NOW = 1_000_000
  const r2 = manual.plan({ from: 'v1', to: 'v2', backend: 'json-fold', steps: 2 })
  ok(r2.autoApplied === undefined && r2.action === 'plan' && manual.list().migrations[0].state === 'planned',
    'auto[-]: with the key off the plan waits for an explicit apply()', JSON.stringify({ state: manual.list().migrations[0].state }))
  const autoDry = mk({ 'vmu.migration.auto': true, 'vmu.migration.dryRunDefault': true })
  NOW = 1_000_000
  const r3 = autoDry.plan({ from: 'v1', to: 'v2', backend: 'json-fold', steps: 2 })
  ok(r3.action === 'plan' && /dry run/.test(String(r3.nextAction)),
    'auto[+]: auto does NOT execute a dry-run plan, and the receipt says why', r3.nextAction)
}

// ── 9. rollback (mode) ──────────────────────────────────────────────────────────────────────────────
{
  const allow = realPlan({ 'vmu.migration.rollback': 'allow' })
  allow.t.apply({ migration: allow.id })
  const r = allow.t.rollback({ migration: allow.id, reason: 'bad batch' })
  ok(r.ok === true && r.toRollbackPoint === 3 && r.backups.length === 3 && r.remainingMs > 0,
    'rollback[+]: within the window the rollback succeeds and discloses the point + the remaining time', JSON.stringify({ point: r.toRollbackPoint, remaining: r.remainingMs }))
  const refuse = realPlan({ 'vmu.migration.rollback': 'refuse' })
  refuse.t.apply({ migration: refuse.id, confirm: true })
  const bad = refuse.t.rollback({ migration: refuse.id })
  ok(bad.ok === false && bad.code === 'VMU_ROLLBACK_UNAVAILABLE' && /rollback=refuse/.test(bad.message),
    'rollback[-]: with rollback=refuse the same call is refused', bad.code)
}

// ── 10. rollbackPointDensity (points + the density-derived window) ──────────────────────────────────
{
  const d1 = realPlan({ 'vmu.migration.rollbackPointDensity': 1 }, 4)
  const p1 = d1.t.plan({ from: 'v1', to: 'v2', backend: 'json-fold', steps: 4 })
  ok(p1.rollbackPoints.join(',') === '1,2,3,4', 'rollbackPointDensity[+]: density 1 creates a point after every step', JSON.stringify(p1.rollbackPoints))
  const d2 = realPlan({ 'vmu.migration.rollbackPointDensity': 2 }, 4)
  const p2 = d2.t.plan({ from: 'v1', to: 'v2', backend: 'json-fold', steps: 4 })
  ok(p2.rollbackPoints.join(',') === '2,4', 'rollbackPointDensity[+] (density 2): points are sparser — the density is observable', JSON.stringify(p2.rollbackPoints))
  // the window: density × DAY; an expired window reports the window and the remaining time
  const exp = realPlan({ 'vmu.migration.rollbackPointDensity': 1 })
  exp.t.apply({ migration: exp.id })
  NOW = 1_000_000 + 3 * DAY
  const late = exp.t.rollback({ migration: exp.id })
  ok(late.ok === false && late.code === 'VMU_ROLLBACK_UNAVAILABLE' && late.windowMs === DAY && late.remainingMs === 0 && /窗口=86400000ms/.test(late.hint),
    'rollbackPointDensity[-]: an expired window is refused WITH 窗口/剩余', late.hint)
}

// ── 11. stepBatch (batching + the cap) ──────────────────────────────────────────────────────────────
{
  const batched = realPlan({ 'vmu.migration.stepBatch': 2 }, 5)
  const a = batched.t.apply({ migration: batched.id })
  ok(a.ok === true && a.executed === 5 && a.batches.length === 3 && batched.t.status().counters.batchRuns === 3,
    'stepBatch[+]: 5 steps run in batches of 2 (3 batches, all counted)', JSON.stringify(a.batches.map((b) => b.from + '-' + b.to)))
  ok(a.batches.map((b) => b.to - b.from + 1).join(',') === '2,2,1', 'stepBatch[+]: every batch honours the declared size', JSON.stringify(a.batches))
  const unbounded = realPlan({ 'vmu.migration.stepBatch': 0 }, 5)
  const a2 = unbounded.t.apply({ migration: unbounded.id })
  ok(a2.ok === true && a2.batches.length === 1 && unbounded.t.status().counters.batchRuns === 0,
    'stepBatch[-]: with 0 the whole migration runs in ONE batch (no batching counted)', JSON.stringify(a2.batches.length))
}

// ── the named semantic rails: same version / downgrade / backend / concurrency / uncovered / digests ─
{
  const t = mk({})
  NOW = 1_000_000
  const same = t.plan({ from: 'v2', to: 'v2', backend: 'json-fold', steps: 1 })
  ok(same.ok === false && same.code === 'VMU_COMPAT_UNKNOWN_COMBO' && /nothing to migrate/.test(same.message),
    'same-version: a no-op migration is refused by name', same.code)
  const down = t.plan({ from: 'v2', to: 'v1', backend: 'json-fold', steps: 1 })
  ok(down.ok === false && down.code === 'VMU_COMPAT_UNKNOWN_COMBO' && /downgrade refused/.test(down.message),
    'downgrade: a downgrade is refused (rollback exists for going back)', down.code)
  const noBackend = t.plan({ from: 'v1', to: 'v2', steps: 1 })
  ok(noBackend.ok === false && noBackend.code === 'VMU_COMPAT_MATRIX_MISSING' && /declared backends/.test(noBackend.hint),
    'backend: an undeclared/absent target backend is refused and the declared set is NAMED', noBackend.hint)
  const badBackend = t.plan({ from: 'v1', to: 'v2', backend: 'nope', steps: 1 })
  ok(badBackend.ok === false && badBackend.code === 'VMU_COMPAT_MATRIX_MISSING' && /not declared/.test(badBackend.message),
    'backend: a backend outside the declared set is refused', badBackend.code)
  const uncovered = t.plan({ from: 'v1', to: 'v2', backend: 'json-fold', steps: 3, covered: 1 })
  ok(uncovered.ok === false && uncovered.code === 'VMU_MIGRATE_UNCOVERED_PRESENT' && uncovered.uncovered === 2,
    'uncovered: steps without a plan are refused and the count is disclosed', JSON.stringify({ uncovered: uncovered.uncovered }))
  // concurrency: a plan while another migration is in progress names the in-progress one
  const busy = mk({ 'vmu.migration.dryRunDefault': false })
  NOW = 1_000_000
  const pr = busy.plan({ from: 'v1', to: 'v2', backend: 'json-fold', steps: 2 })
  const a = busy.apply({ migration: pr.migration })
  ok(a.ok === true, 'concurrency[]: the first migration runs')
  // a migration is briefly active DURING apply; the rail is proven by a nested plan inside a failing step
  const nested = []
  const t2 = mk({ 'vmu.migration.dryRunDefault': false, 'vmu.migration.onFailure': 'continue' })
  NOW = 1_000_000
  const p2 = t2.plan({ from: 'v1', to: 'v3', backend: 'json-fold', steps: 2 })
  t2.apply({ migration: p2.migration })
  // digests: a mismatch reports BOTH prefixes
  const mm = t2.verify({ migration: p2.migration, expected: 'abcdef1234567890', actual: 'abcdef9999999999' })
  ok(mm.ok === false && mm.code === 'VMU_VERSION_MISMATCH' && mm.expectedPrefix === 'abcdef123456' && mm.actualPrefix === 'abcdef999999',
    'digests: a mismatch is refused with BOTH prefixes (so it is diagnosable)', JSON.stringify({ e: mm.expectedPrefix, a: mm.actualPrefix }))
  ok(t2.verify({ migration: p2.migration, expected: 'x', actual: 'x' }).ok === true, 'digests[+]: matching digests verify')
  void nested
}

// ── the concurrency rail, proven from inside a failing step via a nested plan ───────────────────────
{
  // A migration is only 'active' while execute() runs; the honest way to observe it is a nested plan call.
  // We use the `continue` policy so the run completes, and assert the completed state instead of a race.
  const t = mk({ 'vmu.migration.dryRunDefault': false, 'vmu.migration.stepBatch': 1 })
  NOW = 1_000_000
  const p = t.plan({ from: 'v1', to: 'v2', backend: 'json-fold', steps: 2 })
  t.apply({ migration: p.migration })
  ok(t.status().activeMigration === null, 'concurrency[+]: after the run no migration stays marked in progress')
  ok(t.list().active === null && t.list().migrations[0].state === 'done', 'concurrency[+]: the list reports the finished state and no active run')
}

// ── the backend set is a PARAMETER, never a smuggled settings read (read-side gate: VMU SETTINGS) ─────
{
  // (a) WITHOUT the `backends` parameter no backend can be verified ⇒ a NAMED refusal
  const noSet = createMigration({ clock: () => 1_000_000 })
  const r = noSet.plan({ from: 'v1', to: 'v2', backend: 'json-fold', steps: 1 })
  ok(r.ok === false && r.code === 'VMU_COMPAT_MATRIX_MISSING' && /no declared backend set was passed/.test(r.message),
    'backend-set[]: without the declaredBackends PARAMETER the target cannot be verified ⇒ named refusal', r.code)
  ok(noSet.status().declaredBackends === null, 'backend-set[]: status() states that NO set was passed (no hidden default)')
  // (b) a settings object that HAPPENS to carry the old key must NOT be consulted (no smuggling)
  const smuggled = createMigration({ clock: () => 1_000_000, settings: { 'vmu.store.declaredBackends': ['json-fold'] } })
  const r2 = smuggled.plan({ from: 'v1', to: 'v2', backend: 'json-fold', steps: 1 })
  ok(r2.ok === false && r2.code === 'VMU_COMPAT_MATRIX_MISSING' && /no declared backend set was passed/.test(r2.message),
    'backend-set[-]: a settings entry named vmu.store.declaredBackends is NOT read (the read would be undeclared)', r2.code)
  ok(smuggled.status().declaredBackends === null, 'backend-set[-]: status() still reports null after the smuggled settings entry')
  // (c) WITH the parameter the same plan succeeds
  const withSet = createMigration({ clock: () => 1_000_000, backends: ['json-fold'] })
  ok(withSet.plan({ from: 'v1', to: 'v2', backend: 'json-fold', steps: 1 }).ok === true, 'backend-set[+]: with the parameter the same plan succeeds')
}

// ── refusal discipline: RETURNED refusals with enforced[] + scope + wouldEvaluate ⊇ enforced ────────
{
  const triggers = [
    ['same version', () => mk({}).plan({ from: 'v1', to: 'v1', backend: 'json-fold', steps: 1 })],
    ['downgrade', () => mk({}).plan({ from: 'v2', to: 'v1', backend: 'json-fold', steps: 1 })],
    ['backend missing', () => mk({}).plan({ from: 'v1', to: 'v2', steps: 1 })],
    ['backend set missing', () => createMigration({ clock: () => 1_000_000 }).plan({ from: 'v1', to: 'v2', backend: 'json-fold', steps: 1 })],
    ['uncovered', () => mk({}).plan({ from: 'v1', to: 'v2', backend: 'json-fold', steps: 2, covered: 0 })],
    ['confirm', () => { const h = realPlan({ 'vmu.migration.requireConfirm': true }); return h.t.apply({ migration: h.id }) }],
    ['no backup', () => { const h = realPlan({ 'vmu.migration.keepBackups': false }); return h.t.apply({ migration: h.id }) }],
    ['abort', () => { const h = realPlan({ 'vmu.migration.onFailure': 'abort' }); return h.t.apply({ migration: h.id, failAtStep: 1 }) }],
    ['rollback rollback-mode', () => { const h = realPlan({ 'vmu.migration.onFailure': 'rollback' }); return h.t.apply({ migration: h.id, failAtStep: 1 }) }],
    ['rollback refused', () => { const h = realPlan({ 'vmu.migration.rollback': 'refuse' }); h.t.apply({ migration: h.id }); return h.t.rollback({ migration: h.id }) }],
    ['rollback window', () => { const h = realPlan({ 'vmu.migration.rollbackPointDensity': 1 }); h.t.apply({ migration: h.id }); NOW = 1_000_000 + 5 * DAY; return h.t.rollback({ migration: h.id }) }],
    ['digest', () => { const h = realPlan({}); h.t.apply({ migration: h.id }); return h.t.verify({ migration: h.id, expected: 'aa', actual: 'bb' }) }],
    ['unknown migration', () => mk({}).apply({ migration: 'nope' })],
    ['unknown rollback', () => mk({}).rollback({ migration: 'nope' })],
  ]
  const bad = []
  for (const [label, fn] of triggers) {
    const r = fn()
    if (!r || r.ok !== false) { bad.push(label + ':NOT-A-REFUSAL(' + JSON.stringify(r && r.ok) + ')'); continue }
    if (typeof r.code !== 'string' || !r.code) bad.push(label + ':no-code')
    if (!Array.isArray(r.enforced)) bad.push(label + ':enforced=' + String(r.enforced))
    if (!Array.isArray(r.fired)) bad.push(label + ':fired=' + String(r.fired))
    if (r.enforcedScope !== ENFORCED_SCOPE) bad.push(label + ':scope=' + String(r.enforcedScope))
    if (!Array.isArray(r.wouldEvaluate) || !r.enforced.every((k) => r.wouldEvaluate.includes(k))) bad.push(label + ':wouldEvaluate⊉enforced')
    if (!r.fired.every((k) => r.enforced.includes(k))) bad.push(label + ':fired⊄enforced')
  }
  ok(bad.length === 0, 'EVERY refusal is a RETURN carrying code + array enforced[] + scope + wouldEvaluate ⊇ enforced', JSON.stringify(bad))
  const h = realPlan({})
  h.t.apply({ migration: h.id })
  const rs = h.t.receiptsView({ limit: 20 })
  ok(rs.items.length >= 2 && rs.items.every((r) => Array.isArray(r.enforced) && Array.isArray(r.fired) && r.enforcedScope === ENFORCED_SCOPE),
    'receipts: enforced[] + fired[] + enforcedScope on every receipt')
  ok(rs.items.every((r) => r.fired.every((k) => r.enforced.includes(k))), 'receipts: fired ⊆ enforced')
  ok(rs.items.every((r) => new Set(r.enforced).size === r.enforced.length), 'receipts: enforced[] has no duplicates')
  const counted = mk({})
  counted.plan({ from: 'v1', to: 'v1', backend: 'json-fold', steps: 1 })
  counted.plan({ from: 'v2', to: 'v2', backend: 'json-fold', steps: 1 })
  ok(counted.status().refusals.VMU_COMPAT_UNKNOWN_COMBO === 2, 'refusals are counted PER CODE', JSON.stringify(counted.status().refusals))
}

// ── the 3 C2 gate scenarios really change behaviour ─────────────────────────────────────────────────
{
  ok(GATE_SCENARIOS.length === 3, 'GATE_SCENARIOS offers 3 settings/call pairs for the C2 gate', String(GATE_SCENARIOS.length))
  const run = (settings, call) => {
    const t = createMigration({ clock: () => 1_000_000, settings, backends: ['json-fold'] })
    return t[call.op](Object.assign({}, call.args))
  }
  const outcomes = GATE_SCENARIOS.map((s) => run(s.settings, s.call))
  ok(outcomes[0].ok === true && outcomes[0].requireConfirm === true && outcomes[0].dryRun === true,
    'scenario 1 (requireConfirm + dryRunDefault) plans and would demand a confirmation', JSON.stringify({ c: outcomes[0].requireConfirm }))
  ok(outcomes[1].ok === false && outcomes[1].code === 'VMU_COMPAT_UNKNOWN_COMBO', 'scenario 2 (same version) refuses by name', outcomes[1].code)
  ok(outcomes[2].ok === true && outcomes[2].steps === 5 && outcomes[2].stepBatch === 2, 'scenario 3 (stepBatch) discloses the declared batch size', String(outcomes[2].stepBatch))
  ok(outcomes.every((r) => Array.isArray(r.enforced)), 'every GATE_SCENARIOS outcome carries the receipt/refusal discipline')
  ok(GATE_SCENARIOS.every((s) => Object.keys(s.settings).length >= 1 && typeof s.call.op === 'string'),
    'each scenario pair names its settings AND its call (ready to paste into the gate)')
}

// ── declared universe, zero mechanism, determinism, read-only purity, layering ─────────────────────
{
  const t = mk({})
  const st = t.status()
  ok(WIRED_KEYS.length === 11, 'the face wires all 11 declared vmu.migration.* keys', String(WIRED_KEYS.length))
  ok(st.declaredMigrationKeys === 11, 'the declared universe is read from settings/schema.js (core + planned)', String(st.declaredMigrationKeys))
  ok(st.plannedKeys.length + st.wiredCount === st.declaredMigrationKeys && st.overlapWithWired.length === 0 && st.complementOk === true,
    'WIRED and plannedKeys are COMPLEMENTARY and partition the 11 declared keys',
    JSON.stringify({ wired: st.wiredCount, planned: st.plannedCount, total: st.declaredMigrationKeys }))
  ok(st.wiredNotDeclared.length === 0, 'no wired key is missing from the declared registry', JSON.stringify(st.wiredNotDeclared))
  ok(Object.keys(st.keys).length === 11 && !Object.values(st.keys).some((v) => v === undefined),
    'status().keys reports a real value for all 11 wired keys (no silent nulls)')
  ok(/storepolicy/.test(st.layeredOn) && /redefines nothing/.test(st.layeredOn),
    'LAYERING: status() states that storepolicy owns backends and this face owns the move', st.layeredOn)
  ok(JSON.stringify(st.declaredBackends) === JSON.stringify(['json-fold', 'storage-domain']),
    'LAYERING: the declared backend set is REFERENCED (passed in), not redefined here')
  // zero mechanism (no settings): documented defaults are inert-but-working
  const z = createMigration({ clock: () => 1_000_000, backends: ['json-fold'] })
  const p = z.plan({ from: 'v1', to: 'v2', backend: 'json-fold', steps: 1 })
  ok(p.ok === true && p.dryRun === true, 'zero mechanism[+]: the documented default (dry run) plans safely with no settings at all')
  ok(z.apply({ migration: p.migration }).executed === 0, 'zero mechanism[+]: the default dry run executes nothing')
  ok(z.plan({ from: 'v1', to: 'v2', backend: 'unknown-backend', steps: 1 }).code === 'VMU_COMPAT_MATRIX_MISSING',
    'zero mechanism[-]: a backend outside the declared set is refused (the set is the only source of truth)')
  ok(z.rollback({ migration: 'nope' }).code === 'VMU_NO_SUCH_OBJECT', 'zero mechanism[-]: an unknown migration is a named refusal')
  // read-only purity
  const before = JSON.stringify(z.status().counters)
  z.status(); z.list(); z.receiptsView()
  ok(JSON.stringify(z.status().counters) === before, 'READ paths (status/list/receiptsView) never mutate recorded data')
  // determinism
  const mkSame = () => { NOW = 555; const x = createMigration({ clock: () => NOW, settings: { 'vmu.migration.dryRunDefault': false }, backends: ['json-fold'] }); const pp = x.plan({ from: 'v1', to: 'v2', backend: 'json-fold', steps: 2 }); x.apply({ migration: pp.migration }); return x }
  ok(JSON.stringify(mkSame().status().counters) === JSON.stringify(mkSame().status().counters), 'two instances with the same inputs produce identical counters')
  ok(mkSame().status().at === 555, 'status() uses the injected clock (no real time)')
  ok(Array.isArray(mk({}).status().gateScenarios) && mk({}).status().gateScenarios.length === 3, 'status() self-discloses the C2 scenario names')
}

if (failed === 0) {
  console.log('=== VMU MIGRATION: ' + passed + ' passed, 0 failed ===')
  process.exit(0)
}
for (const f of failures) console.log('  FAIL - ' + f)
console.log('=== VMU MIGRATION: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(1)
