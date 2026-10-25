#!/usr/bin/env node
// audit-settings-hot-truth.test.mjs — ★ LIVE RUN 18 (the institute's own report, 「本轮无实质残余：否」 item 2)
//
// THE DEFECT THIS GATE EXISTS FOR. The institute ran `vibe_v5_set { key: "vmu.meetings.quorumMin", value: 2 }` and
// the receipt said `requiresRestart:true` — the write would take effect only on the NEXT START. The settings table,
// however, declared that key `hot: H1` = "next turn". Two sentences about one key, and the wrong one is the one a
// reader believes. Measured scope: **71** of the `vmu.meetings.*` keys declared H1 while `createMeetings()` snapshots
// the whole block into `K` at construction (148 read sites), so every one of them was construction-only in fact and
// hot-on-next-turn only in the table. This gate makes that disagreement impossible to reintroduce silently.
//
// THE RULE: a key the framework itself classifies as CONSTRUCTION-ONLY (`constructionOnlyReasonOf(key)` returns a
// reason) must NOT be declared H0/H1. H2 ("next session") and H3 ("read-only") are both honest; H0/H1 promise a live
// effect the kernel cannot deliver.
//
// NOT VACUOUS: the suite prints how many keys it actually compared, refuses to pass on a suspiciously small number,
// and runs TWO synthetic teeth (a H1 construction-only key must be caught; a H2 one must pass) so a broken predicate
// cannot make the whole gate green.
import { SETTING_DEFS } from '../vibe-math-vmu/settings/schema.js'
import { PLANNED_DEFS } from '../vibe-math-vmu/settings/planned.js'
import { constructionOnlyReasonOf } from '../vibe-math-vmu/kernel/index.js'

let passed = 0
let failed = 0
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; return }
  failed += 1
  console.log('FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
}

const defs = Array.isArray(SETTING_DEFS) ? SETTING_DEFS : []
const planned = Array.isArray(PLANNED_DEFS) ? PLANNED_DEFS : []
const plannedKeys = new Set(planned.map((d) => d.key))

// ── 1. the live table: no implemented key may promise a hot effect it cannot deliver ────────────────────────────────
const offenders = []
let compared = 0
for (const d of defs) {
  if (!d || typeof d.key !== 'string') continue
  if (plannedKeys.has(d.key)) continue                    // planned keys are ASPIRATIONAL: excluded on purpose
  if (d.type === 'planned' || d.planned === true) continue
  compared += 1
  const reason = constructionOnlyReasonOf(d.key)
  if (reason && d.hot !== 'H2' && d.hot !== 'H3') offenders.push({ key: d.key, hot: d.hot, reason: String(reason).slice(0, 90) })
}

ok(compared > 1000, '1a the comparison is not vacuous (more than a thousand implemented keys are compared)', compared)
ok(offenders.length === 0, '1b every construction-only key is declared H2/H3 (a live promise needs a live reader)', offenders.slice(0, 8))
ok(typeof constructionOnlyReasonOf('vmu.meetings.quorumMin') === 'string',
  '1c the predicate really classifies the key the live run tripped over (vmu.meetings.quorumMin)')

// ── 2. the specific family the live run exposed ─────────────────────────────────────────────────────────────────────
const quorum = defs.find((d) => d && d.key === 'vmu.meetings.quorumMin')
ok(!!quorum, '2a vmu.meetings.quorumMin is declared')
ok(quorum && quorum.hot === 'H2', '2b the key whose runtime write was ignored is declared restart-only (not H1)', quorum && quorum.hot)
const meetingsHot = defs.filter((d) => d && typeof d.key === 'string' && d.key.startsWith('vmu.meetings.') && !plannedKeys.has(d.key))
const meetingsLivePromises = meetingsHot.filter((d) => d.hot === 'H0' || d.hot === 'H1')
ok(meetingsHot.length > 50, '2c the meetings family is really covered (more than fifty keys)', meetingsHot.length)
ok(meetingsLivePromises.length === 0, '2d NO vmu.meetings.* key promises an immediate/next-turn effect', meetingsLivePromises.map((d) => d.key).slice(0, 5))

// ── 3. synthetic TEETH: the same rule applied to hand-made rows, so a broken predicate cannot hide ───────────────────
const ruleHolds = (row, predicate) => {
  if (row.type === 'planned' || row.planned === true) return true
  const reason = predicate(row.key)
  return !reason || row.hot === 'H2' || row.hot === 'H3'
}
const fakePredicate = (key) => (key === 'synthetic.constructionOnly' ? 'snapshotted at construction' : null)
ok(ruleHolds({ key: 'synthetic.constructionOnly', hot: 'H1' }, fakePredicate) === false,
  '3a TEETH: a construction-only key declared H1 is caught')
ok(ruleHolds({ key: 'synthetic.constructionOnly', hot: 'H2' }, fakePredicate) === true,
  '3b TEETH: the same key declared H2 passes')
ok(ruleHolds({ key: 'synthetic.live', hot: 'H1' }, fakePredicate) === true,
  '3c TEETH: a key with a real live reader may keep H1')
ok(ruleHolds({ key: 'synthetic.constructionOnly', hot: 'H1', planned: true }, fakePredicate) === true,
  '3d TEETH: a PLANNED key is exempt (it is a design promise, not a wiring claim)')

console.log('=== SETTINGS HOT TRUTH: ' + passed + ' passed, ' + failed + ' failed (compared ' + compared + ' keys) ===')
process.exit(failed ? 1 : 0)
