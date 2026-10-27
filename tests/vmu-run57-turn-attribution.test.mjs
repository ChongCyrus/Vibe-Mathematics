#!/usr/bin/env node
// vmu RUN 57 / F-41b — THE TURN ENGINE KEEPS ONE ATTRIBUTION SLOT; THE SLOT MUST SAY WHOSE IT IS.
//
// THE OBSERVED GAP (live runs 55 and 57): the root agent asked `vibe_vmu_turn { op: "status" }` who the last turn
// went to. The receipt carries the loop's whole status object under `status` - and `status` had `dispatch`, `turns`,
// `woken`, `counts` and `closureVote`, but nothing about the ONE record the engine actually keeps for the most recent
// delivery. The orchestrator HAS always computed `lastAttribution` (route, childId, stopReason, attribution sentence);
// it was exposed as `turn.attribution()` for code, and never in the status a caller reads. So an operator could see a
// tally of nine wakes and still not say "the last delivery was r-2, and it was caller-played".
//
// WHAT THIS SUITE PROVES:
//   1. `status.lastAttribution` exists and is NAMED as the single slot (`slot:"single"`) - a reader who assumes
//      per-member history must be told that the one record is not that;
//   2. the slot names the MEMBER it belongs to (a fact the old record did not carry, so "whose turn?" was unanswerable);
//   3. the slot FOLLOWS the deliveries: step one member, then another, and the slot names the second (with the first
//      member's turn still countable through `woken`/`counts`, which are tallies, not a history);
//   4. a breach is not silently omitted: `attributionMeans` says the history is NOT retained here;
//   5. `memberSessions` reports the member -> child-session map the engine does keep (empty when no host named a child,
//      and never invented);
//   6. `detail:"closure"` still narrows to the closure vote alone (the small face is not widened by this addition).
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const entry = await import(pathToFileURL(ENTRY).href)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const boot = async (config = {}, ctxExtra = {}) => {
  const state = { specs: [] }
  const ctx = Object.assign({
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }, ctxExtra)
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'] }, config))
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const callJSON = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, {}) } catch (e) { return { thrown: true, code: e && e.code, message: e && e.message } }
  try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
}
const turnStatus = async (b) => {
  const r = await callJSON(b, 'vibe_vmu_turn', { op: 'status' })
  return (r.parsed && r.parsed.status) || null
}

const dir = await mkdtemp(join(tmpdir(), 'vmu-r57-turn-slot-'))
try {
  // The CALLER-PLAYED route is the one that needs no host subagents service: `vmu.turn.deliverMode:"caller"` is a
  // declared setting, so it is passed as a dotted key (readSettings takes dotted keys at the config top level).
  const k = await boot({ root: dir, instance: 'shared', 'vmu.turn.deliverMode': 'caller' }, { sessionId: 'session-r57-kernel' })
  const started = await callJSON(k, 'vibe_v5_start', { problem: '第57轮：回合归因槽', researcherCount: 2 })
  ok(started.parsed && started.parsed.ok !== false, 'the institute starts (a turn slot needs members to be about)', started.parsed)
  // The start face names who it hired (`hired`), which is the roster the turn loop chooses from.
  const hired = (started.parsed && started.parsed.hired) || []
  const ids = Array.isArray(hired) ? hired.filter((id) => /^r-\d+$/.test(String(id))) : []
  ok(ids.length >= 2, 'two researchers are on the roster, so two different members can be delivered to', ids)

  // ── 1: before any delivery, the slot exists and says it has nothing ──────────────────────────────────────────
  const s0 = await turnStatus(k)
  ok(s0 !== null, 'the status op returns the loop status under `status`', s0 && Object.keys(s0).slice(0, 8))
  ok(s0 && s0.lastAttribution && s0.lastAttribution.slot === 'single', 'status carries the attribution slot and NAMES it as single (not a history)', s0 && s0.lastAttribution)
  ok(s0 && s0.lastAttribution && s0.lastAttribution.member === null, 'before any delivery the slot names no member (null, not a guessed name)', s0 && s0.lastAttribution && s0.lastAttribution.member)
  ok(s0 && typeof s0.attributionMeans === 'string' && /ONE attribution slot/.test(s0.attributionMeans), 'attributionMeans says the engine keeps ONE slot', s0 && s0.attributionMeans)
  ok(s0 && typeof s0.attributionMeans === 'string' && /not retained here/.test(s0.attributionMeans), 'attributionMeans says per-member history is NOT retained here', s0 && s0.attributionMeans)
  ok(s0 && s0.memberSessions && typeof s0.memberSessions === 'object', 'status carries memberSessions (the map the engine really keeps)', s0 && s0.memberSessions)

  // ── 2: first delivery names ITS member ───────────────────────────────────────────────────────────────────────
  const t1 = await callJSON(k, 'vibe_vmu_turn', { op: 'step', member: ids[0], why: 'first delivery for the slot test' })
  ok(t1.parsed && t1.parsed.ok !== false, 'the first step is accepted (caller-played, no host subagents in this assembly)', t1.parsed || t1)
  const s1 = await turnStatus(k)
  ok(s1 && s1.lastAttribution && s1.lastAttribution.member === ids[0], 'after the first step the slot names THAT member', s1 && s1.lastAttribution)
  ok(s1 && s1.lastAttribution && s1.lastAttribution.slot === 'single', 'the slot is still declared single after a delivery', s1 && s1.lastAttribution && s1.lastAttribution.slot)
  ok(s1 && s1.lastAttribution && s1.lastAttribution.deliveryPath === 'caller', 'the slot reports HOW the delivery went (caller-played here, not invented as a child)', s1 && s1.lastAttribution)

  // ── 3: second delivery REPLACES the slot, and the tally still counts both ────────────────────────────────────
  const t2 = await callJSON(k, 'vibe_vmu_turn', { op: 'step', member: ids[1], why: 'second delivery for the slot test' })
  ok(t2.parsed && t2.parsed.ok !== false, 'the second step is accepted', t2.parsed || t2)
  const s2 = await turnStatus(k)
  ok(s2 && s2.lastAttribution && s2.lastAttribution.member === ids[1], 'the slot FOLLOWS the deliveries: it now names the second member', s2 && s2.lastAttribution)
  ok(s2 && s2.counts && typeof s2.counts.delivered === 'number' && s2.counts.delivered >= 2, 'the tally still counts both deliveries (the tally is not a history, and the slot is not a tally)', s2 && s2.counts)
  ok(s2 && s2.woken && typeof s2.woken === 'object', 'per-member wake tallies stay available where they really live (`woken`)', s2 && s2.woken)
  ok(s2 && s2.lastAttribution && s2.lastAttribution.member !== ids[0], 'the slot does NOT accumulate: the first member is not merged into it', s2 && s2.lastAttribution)

  // ── 4: memberSessions never invents a child id ──────────────────────────────────────────────────────────────
  ok(s2 && s2.memberSessions && Object.keys(s2.memberSessions).length === 0, 'with no host child sessions, memberSessions stays EMPTY rather than inventing ids', s2 && s2.memberSessions)

  // ── 5: the narrow closure face is unchanged ────────────────────────────────────────────────────────────────
  const narrow = await callJSON(k, 'vibe_vmu_turn', { op: 'status', detail: 'closure' })
  const np = narrow.parsed
  ok(np && np.detail === 'closure', 'detail:"closure" still narrows', np)
  ok(np && !Object.prototype.hasOwnProperty.call(np, 'lastAttribution'), 'the narrow closure face does NOT grow the attribution slot (narrowing stays narrow)', np)
} finally {
  await rm(dir, { recursive: true, force: true }).catch(() => {})
}

console.log('\n=== VMU RUN 57 TURN SLOT: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.error('\nFAILURES:')
  for (const f of failures) console.error(' - ' + f)
  process.exit(1)
}
