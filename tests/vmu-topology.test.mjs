// Independent test for vmu kernel · topology (no dependency on kernel/index.js).
// Run: node tests/vmu-topology.test.mjs     Last line: === VMU TOPOLOGY: N passed, M failed ===
import { createTopology, KINDS, CODE } from '../vibe-math-vmu/kernel/topology.js'

let passed = 0
let failed = 0
function ok(cond, label) { if (cond) { passed += 1 } else { failed += 1; console.log('FAIL ' + label) } }
function fakeClock(start = 1000) { let t = start; return { clock: () => t, advance: (ms) => { t += ms } } }
const withSettings = (extra) => ({ 'vmu.topology.mode': 'flat', ...extra })

// ── 1. flat = zero mechanism (default) ────────────────────────────────────────────────────────
{
  const c = fakeClock()
  const t = createTopology({ clock: c.clock })
  const r = t.route({ from: 'anyone', to: 'anybody' })
  ok(r.ok === true && r.path === null, 'flat: any path is legal (no constraint)')
  ok(t.assert({ from: 'a', to: 'z' }).allowed === true, 'flat: assert allows anything')
  const st = t.status()
  ok(st.zeroMechanism === true && st.mode === 'flat', 'flat: status self-discloses zero mechanism')
  ok(st.describeAndAssertShareRules === true && st.sourceOfTruth === 'rules()', 'flat: status discloses the single source of truth')
  ok(t.describe().invariants.join('').indexOf('no constraint') !== -1, 'flat: describe names the zero mechanism')
}

// ── 2. star: center only ─────────────────────────────────────────────────────────────────────
{
  const c = fakeClock()
  const t = createTopology({ clock: c.clock, settings: withSettings({ 'vmu.topology.mode': 'star', 'vmu.topology.starCenterSlot': 'boss' }) })
  ok(t.route({ from: 'boss', to: 'm1' }).path.join(',') === 'boss,m1', 'star: center → member allowed')
  ok(t.route({ from: 'm1', to: 'boss' }).path.join(',') === 'm1,boss', 'star: member → center allowed')
  const a = t.assert({ from: 'm1', to: 'm2' })
  ok(a.allowed === false && a.refused.code === CODE.forbidden, 'star: member → member refused by name')
  ok(/boss/.test(a.refused.hint), 'star: refusal gives the allowed path (through the center)')
  const noCenter = createTopology({ clock: c.clock, settings: withSettings({ 'vmu.topology.mode': 'star' }) })
  ok(noCenter.assert({ from: 'a', to: 'b' }).refused.code === CODE.unsupported, 'star: missing center ⇒ VMU_TOPOLOGY_UNSUPPORTED')
}

// ── 3. committee + swarm: all-to-all ─────────────────────────────────────────────────────────
{
  const c = fakeClock()
  const cm = createTopology({ clock: c.clock, settings: withSettings({ 'vmu.topology.mode': 'committee', 'vmu.topology.committeeSize': 2 }) })
  ok(cm.route({ from: 'm1', to: 'm2' }).ok === true, 'committee: direct contact allowed')
  const over = cm.assert({ from: 'm1', to: 'm2' })
  ok(over.allowed === true, 'committee: within the size cap is fine')
  const big = createTopology({ clock: c.clock, settings: withSettings({ 'vmu.topology.mode': 'committee', 'vmu.topology.committeeSize': 2 }) })
  let sizeErr = null; try { big.route({ from: 'm1', to: 'm2', size: 5 }) } catch (e) { sizeErr = e }
  ok(!!sizeErr && sizeErr.code === CODE.size, 'committee: exceeding committeeSize is refused (size code)')
  const sw = createTopology({ clock: c.clock, settings: withSettings({ 'vmu.topology.mode': 'swarm', 'vmu.topology.swarmQuorum': 3 }) })
  ok(sw.route({ from: 'a', to: 'b' }).ok === true && sw.status().params.swarmQuorum === 3, 'swarm: no path constraint, quorum reported')
}

// ── 4. market: requires a work item + bid window ─────────────────────────────────────────────
{
  const c = fakeClock(0)
  const t = createTopology({ clock: c.clock, settings: withSettings({ 'vmu.topology.mode': 'market', 'vmu.topology.marketBidWindowMs': 100 }) })
  ok(t.route({ from: 'buyer', to: 'seller', work: 'task-1' }).ok === true, 'market: contact with a work item is allowed')
  const a = t.assert({ from: 'buyer', to: 'seller' })
  ok(a.allowed === false && a.refused.code === CODE.forbidden && /work/.test(a.refused.hint), 'market: bare message refused and told to attach work')
  const late = t.route({ from: 'b', to: 's', work: 'task-2', lastBidAt: 0 })
  ok(late.ok === true, 'market: a fresh bid is inside the window')
  const stale = (() => { try { t.route({ from: 'b', to: 's', work: 'task-3', lastBidAt: -1000 }); return null } catch (e) { return e } })()
  ok(!!stale && stale.code === CODE.forbidden && /window/.test(stale.message), 'market: a stale bid is refused by name')
}

// ── 5. pipeline: adjacent stages only, no cycles ─────────────────────────────────────────────
{
  const c = fakeClock()
  const t = createTopology({ clock: c.clock, settings: withSettings({ 'vmu.topology.mode': 'pipeline', 'vmu.topology.pipelineStages': ['draft', 'review', 'publish'] }) })
  ok(t.route({ from: 'draft', to: 'review' }).path.join('>') === 'draft>review', 'pipeline: adjacent hand-off allowed')
  const skip = t.assert({ from: 'draft', to: 'publish' })
  ok(skip.allowed === false && skip.refused.code === CODE.forbidden, 'pipeline: stage skip refused by name')
  ok(/review/.test(skip.refused.hint), 'pipeline: refusal gives the allowed next stage')
  const cyc = t.assert({ from: 'review', to: 'review' })
  ok(cyc.allowed === false && cyc.refused.code === CODE.cycle, 'pipeline: self hand-off detected as a cycle')
  ok(t.assert({ from: 'nope', to: 'review' }).refused.code === CODE.forbidden, 'pipeline: unknown stage refused')
  const noStages = createTopology({ clock: c.clock, settings: withSettings({ 'vmu.topology.mode': 'pipeline' }) })
  ok(noStages.assert({ from: 'a', to: 'b' }).refused.code === CODE.unsupported, 'pipeline: missing stages ⇒ VMU_TOPOLOGY_UNSUPPORTED')
}

// ── 6. matrix: same lane ok, cross-dimension refused unless allowed ──────────────────────────
{
  const c = fakeClock()
  const t = createTopology({ clock: c.clock, settings: withSettings({ 'vmu.topology.mode': 'matrix', 'vmu.topology.matrixDimensions': ['business', 'topic'] }) })
  ok(t.route({ from: 'business:m1', to: 'business:m2' }).ok === true, 'matrix: within one dimension allowed')
  const cross = t.assert({ from: 'business:m1', to: 'topic:m9' })
  ok(cross.allowed === false && cross.refused.code === CODE.forbidden, 'matrix: cross-dimension refused by name')
  ok(/business/.test(cross.refused.hint) && /allowCrossLane/.test(cross.refused.hint), 'matrix: refusal offers the same-lane relay or the explicit switch')
  const permissive = createTopology({ clock: c.clock, settings: withSettings({ 'vmu.topology.mode': 'matrix', 'vmu.topology.allowCrossLane': true }) })
  ok(permissive.route({ from: 'business:m1', to: 'topic:m9' }).ok === true, 'matrix: allowCrossLane=true permits the hop')
  ok(t.assert({ from: 'unqualified', to: 'business:m2' }).refused.code === CODE.forbidden, 'matrix: unqualified ids refused with the dimension hint')
}

// ── 7. hierarchy: adjacent levels only, depth cap, no cycles ─────────────────────────────────
{
  const c = fakeClock()
  const t = createTopology({ clock: c.clock, settings: withSettings({ 'vmu.topology.mode': 'hierarchy', 'vmu.topology.hierarchyDepthMax': 3 }) })
  ok(t.route({ from: 'm1', to: 'm11' }).ok === true, 'hierarchy: parent → child allowed')
  ok(t.route({ from: 'm11', to: 'm1' }).ok === true, 'hierarchy: child → parent allowed')
  const skip = t.assert({ from: 'm1', to: 'm111' })
  ok(skip.allowed === false && skip.refused.code === CODE.forbidden, 'hierarchy: level skip (越级) refused by name')
  ok(/level/i.test(skip.refused.message), 'hierarchy: refusal explains the level skip')
  const cyc = t.assert({ from: 'm11', to: 'm11' })
  ok(cyc.allowed === false && cyc.refused.code === CODE.cycle, 'hierarchy: self-address detected as a cycle')
  const deep = createTopology({ clock: c.clock, settings: withSettings({ 'vmu.topology.mode': 'hierarchy', 'vmu.topology.hierarchyDepthMax': 1 }) })
  ok(deep.assert({ from: 'm1', to: 'm12' }).refused.code === CODE.size, 'hierarchy: depth beyond the cap refused (size code)')
}

// ── 8. describe() and assert() share ONE source of truth ─────────────────────────────────────
{
  const c = fakeClock()
  const t = createTopology({ clock: c.clock, settings: withSettings({ 'vmu.topology.mode': 'hierarchy', 'vmu.topology.hierarchyDepthMax': 3 }) })
  const d = t.describe()
  const a = t.assert({ from: 'm1', to: 'm111' })
  const hinted = String(a.refused.hint)
  ok(d.invariants.every((inv) => hinted.length > 0) && /adjacent|parent|child|depth/i.test(d.invariants.join(' ')), 'same-source: describe lists the hierarchy invariants')
  ok(hinted.indexOf(d.invariants[d.invariants.length - 1].slice(0, 12)) !== -1 || hinted.indexOf('invariants:') !== -1, 'same-source: the refusal hint quotes the same invariants')
  const p = createTopology({ clock: c.clock, settings: withSettings({ 'vmu.topology.mode': 'pipeline', 'vmu.topology.pipelineStages': ['a', 'b', 'c'] }) })
  ok(/adjacent/.test(p.describe().invariants.join(' ')) && /adjacent|allowed/.test(p.assert({ from: 'a', to: 'c' }).refused.hint), 'same-source: pipeline describe/assert agree')
  ok(t.describe({ kind: 'matrix' }).kind === 'matrix', 'describe: can describe another kind without switching the selection')
  ok(t.list().mode === 'hierarchy', 'describe: describing another kind does not mutate the selection')
}

// ── 9. read-only surfaces never mutate ───────────────────────────────────────────────────────
{
  const c = fakeClock()
  const t = createTopology({ clock: c.clock, settings: withSettings({ 'vmu.topology.mode': 'star', 'vmu.topology.starCenterSlot': 'boss' }) })
  t.select({ kind: 'star' })
  const st = JSON.stringify(t.status()); const li = JSON.stringify(t.list()); const de = JSON.stringify(t.describe())
  t.status(); t.list(); t.describe(); t.route({ from: 'boss', to: 'm1' }); t.assert({ from: 'm1', to: 'm2' })
  ok(JSON.stringify(t.status()) === st && JSON.stringify(t.list()) === li && JSON.stringify(t.describe()) === de, 'read-only: repeated reads/asserts leave state identical')
  ok(t.list().selectionHistory.length === 1, 'read-only: history grew only from select()')
}

// ── 10. selection history + truncation counting ──────────────────────────────────────────────
{
  const c = fakeClock(0)
  const t = createTopology({ clock: c.clock })
  for (let i = 0; i < 130; i++) { c.advance(1); t.select({ kind: i % 2 ? 'swarm' : 'flat' }) }
  const l = t.list()
  ok(l.selectionHistory.length === 100 && l.historyDropped === 30, 'truncation: history capped at 100 with dropped=30 reported')
  ok(t.status().historyDropped === 30, 'truncation: status reports the dropped count too')
}

// ── 11. determinism (injected clock only) ────────────────────────────────────────────────────
{
  const mk = () => { const c = fakeClock(500); const t = createTopology({ clock: c.clock, settings: withSettings({ 'vmu.topology.mode': 'pipeline', 'vmu.topology.pipelineStages': ['a', 'b'] }) }); t.select({ kind: 'pipeline' }); return t }
  const a = mk(); const b = mk()
  ok(JSON.stringify(a.status()) === JSON.stringify(b.status()), 'determinism: two instances agree on status()')
  ok(JSON.stringify(a.list()) === JSON.stringify(b.list()), 'determinism: two instances agree on list()')
  ok(a.route({ from: 'a', to: 'b' }).hops === b.route({ from: 'a', to: 'b' }).hops, 'determinism: same route result')
}

// ── 12. kinds + unsupported refusals ─────────────────────────────────────────────────────────
{
  const c = fakeClock()
  const t = createTopology({ clock: c.clock })
  ok(KINDS.length === 8 && KINDS.includes('flat') && KINDS.includes('hierarchy'), 'kinds: flat + seven topologies are exported')
  ok(KINDS.slice(1).every((k) => ['star', 'committee', 'market', 'pipeline', 'swarm', 'matrix', 'hierarchy'].includes(k)), 'kinds: the seven named topologies are all present')
  let e = null; try { t.select({ kind: 'bogus' }) } catch (err) { e = err }
  ok(!!e && e.code === CODE.unsupported, 'select: unknown kind refused with VMU_TOPOLOGY_UNSUPPORTED')
  e = null; try { t.route({ kind: 'bogus', from: 'a', to: 'b' }) } catch (err) { e = err }
  ok(!!e && e.code === CODE.unsupported, 'route: unknown kind refused')
  e = null; try { t.route({ from: 'a' }) } catch (err) { e = err }
  ok(!!e && e.code === 'VMU_INVALID_ARGUMENT', 'route: missing to refused')
  ok(t.status().cycleDetection.join(',') === 'hierarchy,pipeline', 'status: names the cycle-checked topologies')
}

console.log('=== VMU TOPOLOGY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)
