#!/usr/bin/env node
// vmu RUN 138 — TWO RECEIPTS THAT COULD NOT EXPLAIN THEMSELVES.
//
// THE OBSERVED DEFECTS (real run 138, the institute's own drill):
//   F-138b: `vibe_v5_read_library {member:"r-acad", kind:"propositions"}` answered
//           `{ ok:true, kind:"propositions", total:0, cards:[], skippedTracks:[], hint:null }` — while
//           `vibe_v5_read_library {id:"p-r138-proof"}` could see the very same card (owner r-acad, track
//           "propositions", kind "proposition"). Cause: `kind` filters a row's `kind`, and "propositions" is a TRACK
//           name, so the filter matched nothing; the receipt then reported the zero with no filter disclosure.
//   F-138c: `vibe_vmu_meeting {action:"hands", id:"m1"}` on a SERVICE meeting answered
//           `VMU_ENGINE_UNAVAILABLE`, while the teaching (seat-faces.js / v5r-blocks-b.js) and docs/03 both promise
//           `VMU_REGISTRY_BOUNDARY` for a primitive-only verb aimed at the service registry.
//
// WHAT THIS SUITE PROVES: (1) a `kind` that names a TRACK is disclosed as such, with the executable call that reads
// that track; (2) a `kind` that matches rows reports kindMatched:true and no note; (3) a `kind` that matches nothing
// says which kinds ARE present (so a zero can never be mistaken for "the member wrote nothing"); (4) `hands` on a
// service meeting refuses with the code the teaching predicts, plus the boundary fields the rest of the face publishes.
import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
let NOW = 1000
const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async (spec) => { state.specs.push(spec); return () => {} } } }
  const handle = entry.apply(ctx, Object.assign({ clock: () => NOW }, config))
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args = {}, exec = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { parsed: undefined, missing: true }
  const raw = await spec.execute(args, exec)
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  return { raw, parsed, missing: false }
}

const root = await mkdtemp(join('D:/_tmp', 'vmu-run138-'))
try {
  const b = await boot({ root, packs: ['v5r'] })
  const kernel = b.handle.kernel
  await kernel.members.hire({ id: 'r-chair', slot: 'chair' })
  await kernel.members.hire({ id: 'r-acad', slot: 'member' })
  ok(kernel.members.roster().length === 2, 'setup: a chair seat and one member really exist (RULE E)', kernel.members.roster().map((m) => m.id))

  // A card, written through the pack face exactly like the drill did (owner = the member, not the caller).
  const wrote = await call(b, 'vibe_v5_record_proposition', {
    id: 'p-r138-proof', title: '回归：平方是偶数的整数是偶数',
    statement: '对一切整数 n，若 n^2 是偶数，则 n 是偶数', value: 0.6,
    motive: '教科书中的基本结论，值得复核', p: 0.6, member: 'r-acad',
    proof_ref: 'Members/r-acad/Propos/p-r138-proof.md#正式证明', proof_state: 'complete',
  })
  ok(wrote.parsed && wrote.parsed.ok === true, 'setup: the card is really written (the row this suite reads back exists)', wrote.parsed && (wrote.parsed.code || wrote.parsed.recordId))

  // ── §1 F-138b: a TRACK name used as a `kind` must be disclosed, not silently empty ────────────────────────
  const byTrackName = await call(b, 'vibe_v5_read_library', { member: 'r-acad', kind: 'propositions', limit: 3 })
  ok(byTrackName.parsed && byTrackName.parsed.ok === true, '§1 the read really succeeds (a filter that matches nothing is not an error)', byTrackName.parsed && byTrackName.parsed.code)
  ok(byTrackName.parsed && byTrackName.parsed.kindMatched === false,
    '§1 ★ the receipt says the filter matched NOTHING (kindMatched:false) instead of reporting a bare zero', byTrackName.parsed && { kindMatched: byTrackName.parsed.kindMatched, total: byTrackName.parsed.total })
  ok(!!(byTrackName.parsed && /TRACK/.test(String(byTrackName.parsed.kindNote || '')) && /track:"propositions"/.test(String(byTrackName.parsed.kindNote || ''))),
    '§1 … the note names it as a TRACK and gives the executable call that reads that track', byTrackName.parsed && byTrackName.parsed.kindNote)
  ok(!!(byTrackName.parsed && Array.isArray(byTrackName.parsed.kindsPresent) && byTrackName.parsed.kindsPresent.includes('proposition')),
    '§1 … and lists the kinds that ARE present in the read tracks (proposition), so the zero is checkable', byTrackName.parsed && byTrackName.parsed.kindsPresent)
  ok(!!(byTrackName.parsed && byTrackName.parsed.hint === byTrackName.parsed.kindNote),
    '§1 … and the hint carries the same sentence (a reader who only reads `hint` is not left blind)', byTrackName.parsed && { hint: byTrackName.parsed.hint && String(byTrackName.parsed.hint).slice(0, 60) })

  // ── §2 the same read through the TRACK really returns the card (the note points somewhere real) ────────────
  const byTrack = await call(b, 'vibe_v5_read_library', { member: 'r-acad', track: 'propositions', limit: 3 })
  ok(byTrack.parsed && byTrack.parsed.ok === true && byTrack.parsed.total >= 1,
    '§2 ★ reading the TRACK returns the card (so the §1 note points at a door that really opens)', byTrack.parsed && { total: byTrack.parsed.total, tracks: byTrack.parsed.tracks })
  ok(byTrack.parsed && byTrack.parsed.kindMatched === true && byTrack.parsed.kindNote === null,
    '§2 … with no filter note when no filter was given (kindMatched:true, kindNote:null)', byTrack.parsed && { kindMatched: byTrack.parsed.kindMatched, kindNote: byTrack.parsed.kindNote })

  // ── §3 a real `kind` filter keeps working and reports kindMatched:true ────────────────────────────────────
  const byKind = await call(b, 'vibe_v5_read_library', { member: 'r-acad', kind: 'proposition', limit: 3 })
  ok(byKind.parsed && byKind.parsed.kindMatched === true && byKind.parsed.kindNote === null,
    '§3 a REAL kind filter is not nagged with a note (no false alarm)', byKind.parsed && { kindMatched: byKind.parsed.kindMatched })
  ok(byKind.parsed && byKind.parsed.total >= 1, '§3 … and it still matches the card it names', byKind.parsed && byKind.parsed.total)

  // ── §4 an unknown `kind` names the kinds that exist ────────────────────────────────────────────────────────
  const bogus = await call(b, 'vibe_v5_read_library', { member: 'r-acad', kind: 'propositionz', limit: 3 })
  ok(bogus.parsed && bogus.parsed.kindMatched === false && /no row among the read tracks carries kind/.test(String(bogus.parsed.kindNote || '')),
    '§4 an unknown kind says so in words a reader can act on', bogus.parsed && bogus.parsed.kindNote)
  ok(!!(bogus.parsed && /proposition/.test(String(bogus.parsed.kindNote || ''))),
    '§4 … and names the kinds that ARE present (so "0" is not the whole answer)', bogus.parsed && bogus.parsed.kindNote)

  // ── §5 F-138c: `hands` on a SERVICE meeting refuses with the code the teaching predicts ───────────────────
  const opened = kernel.meetings.open({ type: 'ordinary', title: '回归：hands 的码', member: 'r-chair', agenda: '核对 hands 的拒绝码' })
  const mid = opened && (typeof opened.meeting === 'string' ? opened.meeting : (opened.meeting && opened.meeting.id) || opened.id)
  ok(!!mid, '§5 setup: a SERVICE meeting really opened (the refused call must address a real object)', mid)
  const hands = await call(b, 'vibe_vmu_meeting', { action: 'hands', id: mid, op: 'list' })
  ok(hands.parsed && hands.parsed.ok === false, '§5 hands on a service meeting is REFUSED', hands.parsed && hands.parsed.ok)
  ok(hands.parsed && hands.parsed.code === 'VMU_REGISTRY_BOUNDARY',
    '§5 ★ … with VMU_REGISTRY_BOUNDARY — the code the teaching and docs/03 promise for this fact', hands.parsed && hands.parsed.code)
  ok(hands.parsed && hands.parsed.boundaryOnly === true && hands.parsed.actionCrosses === false && hands.parsed.registry === 'service' && hands.parsed.askedAction === 'hands',
    '§5 … and it publishes the boundary fields the rest of this face publishes (boundaryOnly/actionCrosses/registry/askedAction)',
    hands.parsed && { boundaryOnly: hands.parsed.boundaryOnly, actionCrosses: hands.parsed.actionCrosses, registry: hands.parsed.registry, askedAction: hands.parsed.askedAction })
  ok(!!(hands.parsed && /PRIMITIVE/.test(String(hands.parsed.message || ''))), '§5 … the first clause names the face it belongs to (PRIMITIVE), not "engine unavailable"', hands.parsed && hands.parsed.message)
  ok(!!(hands.parsed && /action=hand/.test(String(hands.parsed.hint || '')) && /action=invite/.test(String(hands.parsed.hint || ''))),
    '§5 … and the hint still gives the two calls that DO exist on this face', hands.parsed && hands.parsed.hint)
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
}

console.log('\n=== VMU RUN 138 (read filter disclosure, hands refusal code): ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) {
  for (const f of failures) console.log('  · ' + f)
  process.exit(1)
}
