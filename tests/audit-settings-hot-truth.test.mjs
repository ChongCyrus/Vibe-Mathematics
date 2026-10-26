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
//
// ★ ROUND task-7 (2026-05): §1/§2 were still red on the forty-seven `vmu.meetings.*` rows that live in the GENERATED
// block of `settings/schema.js` (the WIRED-SCHEMA splice) — `scripts/generate-wired-schema.mjs` hard-coded
// `hot: HOT.H1` for every emitted row, so the artifact promised "next turn" no matter what the kernel said. Both halves
// are fixed at the DECLARATION, not by inventing a live reader: the generator now derives the class from the kernel's
// own `constructionOnlyReasonOf` (one owner, so a family exception stays a single edit) and writes the reason into the
// row's `doc`. §4 below is the MECHANISM SELF-PROOF the claim rests on: it builds a real `createMeetings()` face, writes
// the setting at runtime, and shows the SAME face ignoring the write while a FRESH face sees it — "next session" is the
// measurement, not a reading of the table that makes the claim.
import { SETTING_DEFS } from '../vibe-math-vmu/settings/schema.js'
import { PLANNED_DEFS } from '../vibe-math-vmu/settings/planned.js'
import { constructionOnlyReasonOf } from '../vibe-math-vmu/kernel/index.js'
import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'

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

// ── 4. MECHANISM SELF-PROOF: run the real construct-time snapshot instead of trusting the class table ─────────────────
// The claim under test is "a runtime write to these keys changes nothing until the next start". So we do the write and
// read the PUBLIC face, and we add a control that proves the write LANDED, because "the value did not change" is also
// what a dead settings handle produces:
//   before write  quorumMin=2 in K ⇒ public quorum() face reports min=2 / required=2
//   after  write  quorumMin=5 in the backing store ⇒ the SAME face still reports min=2 / required=2   (ignored)
//   fresh face    a createMeetings() built AFTER the write reports min=5 / required=5                 (control: landed)
// Numbers are asserted, not printed: if the kernel ever starts reading the key live, 4b goes red with the reading in
// its detail, and the declaration would have to move back to H1 in the same change.
const NOW = 1_790_000_000_000
const backing = { 'vmu.meetings.quorumMin': 2 }
const liveSettings = { get: (k) => backing[k] }   // a settings handle: whoever calls .get reads the CURRENT backing value
const mg = createMeetings({ clock: () => NOW, settings: liveSettings })
const opened = mg.open({ type: 'ordinary', roster: ['a', 'b'] })
const beforeWrite = mg.quorum({ meeting: opened.meeting })
ok(beforeWrite && beforeWrite.min === 2, '4a the construct-time snapshot really reads the setting (min=2 before the write)', beforeWrite && { min: beforeWrite.min, required: beforeWrite.required })

backing['vmu.meetings.quorumMin'] = 5             // exactly what a settings set() does between turns
const afterWrite = mg.quorum({ meeting: opened.meeting })
ok(afterWrite && afterWrite.min === 2 && afterWrite.required === 2,
  '4b ★ COUNTERFACTUAL: the live meeting face IGNORES a runtime write (still min=2/required=2 after the store says 5) — this is what makes H2 and H1 different sentences',
  afterWrite && { storeSays: backing['vmu.meetings.quorumMin'], face: { min: afterWrite.min, required: afterWrite.required } })

const mgFresh = createMeetings({ clock: () => NOW, settings: liveSettings })
const freshFace = mgFresh.quorum({ meeting: mgFresh.open({ type: 'ordinary', roster: ['a', 'b'] }).meeting })
ok(freshFace && freshFace.min === 5,
  '4c CONTROL: a face built AFTER the write DOES see 5 — so 4b is a snapshot, not a broken settings handle',
  freshFace && { min: freshFace.min, required: freshFace.required })

ok(quorum && quorum.hot === 'H2' && afterWrite && afterWrite.min === beforeWrite.min && freshFace && freshFace.min === 5,
  '4d the declared class (H2 "next session") IS the measured one: ignored now, effective next start (H1 would be a false promise, H3 would deny the effect that 4c shows)',
  { declared: quorum && quorum.hot, ignoredSameFace: afterWrite && afterWrite.min === beforeWrite.min, effectiveFreshFace: freshFace && freshFace.min === 5 })

console.log('=== SETTINGS HOT TRUTH: ' + passed + ' passed, ' + failed + ' failed (compared ' + compared + ' keys) ===')
process.exit(failed ? 1 : 0)
