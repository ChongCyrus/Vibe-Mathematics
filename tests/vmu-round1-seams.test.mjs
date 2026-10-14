// tests/vmu-round1-seams.test.mjs - resident form of the round-1 SEAMS probe (vmu-core's task-4 probe).
//
// PROMOTED FROM A SCRATCH SCRIPT. It used to live at `D:\_tmp\vmu-r1\probe.mjs` and import the preset through
// absolute `file:///D:/...` URLs, i.e. it could not run on any other machine, was invisible to the gate
// (the runner scans `tests/` top level only) and left its `mkdtemp` workspaces behind. This suite keeps the
// probe's 37 ASSERTIONS AND THEIR SEMANTICS, and changes only their container:
//   · imports are repository-relative, so the suite travels with the tree;
//   · every workspace is created under `os.tmpdir()` and removed on exit (a killed suite cannot leak state
//     into the next run);
//   · assertions are named, counted and reported in the house style, with a non-zero exit on any failure.
//
// WHAT IT PINS (five seams, each through the REAL assembly rather than a re-implementation):
//   K1 tool-face reachability  - zero declaration ⇒ exactly one tool; the declaration map reaches EVERY face
//                                the table declares (the count is DERIVED from FACE_KEYS/TOOL_FACES, never typed:
//                                Round 2 added five faces and a hard-coded number became four stale assertions).
//   K2 durable key             - the idempotency ledger writes and reads back through a REAL store.
//   K3 turn delivery seam      - `deliverTurn` is accepted, reported, and actually used by a real round.
//   K4 prompt settings         - a section declared in SETTINGS reaches the real kernel pipeline.
//   K5 pack merge              - the priority ladder, NAMED conflicts, and the `shadowed` override record.
//
// MEASURED BOUNDARY (read this before quoting a green run) - the HOST is a fake; the product is real.
//   1. `ctx.get()` here answers `null` for every service it does not model. A real host REFUSES an unknown
//      service instead, so "no subagents ⇒ no seam" is proven against a null, not against the host's error.
//   2. `ctx.effect(fn)` here just calls `fn()` and returns `undefined`. A real `ctx.effect` returns a
//      DISPOSER, so this suite does NOT cover unregistration/teardown.
//   3. `ctx.tools.register` records specs and returns a no-op disposer; `ctx.systemPrompt.section` is a no-op.
//      Tool PRESENCE is covered; tool presentation/ordering on a real prompt is not.
//   4. The all-faces check satisfies the `library` surface with a read-through Proxy, because that kernel member
//      is a getter with no setter. On a real host the surface comes from real services.
//   5. K2 waits for the store's async projection with a BOUNDED POLL, not the probe's fixed 25 ms sleep: the
//      fixed sleep was load-sensitive (the very flake class this repository keeps recording).
//
// Run: node tests/vmu-round1-seams.test.mjs
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { createStore } from '../vibe-math-vmu/kernel/store.js'
import { createIdempotency, LEDGER_KEY } from '../vibe-math-vmu/kernel/idempotency.js'
import { toolSpecs, resolveFaces, FACE_KEYS, TOOL_FACES } from '../vibe-math-vmu/host.js'
import { deliverViaSubagents } from '../vibe-math-vmu/kernel/turn/index.js'
import * as entry from '../vibe-math-vmu/vibe-math-vmu.js'

let passed = 0, failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label) }
  else { failed++; failures.push(label + (detail === undefined ? '' : ' [' + detail + ']')); console.error('  FAIL ' + label + (detail === undefined ? '' : ' [' + detail + ']')) }
}

// Every workspace this suite creates, removed once (including on an abnormal exit).
const roots = []
const mkroot = (prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); roots.push(d); return d }
const cleanup = () => { for (const d of roots.splice(0)) { try { rmSync(d, { recursive: true, force: true }) } catch (e) { /* best effort */ } } }
process.on('exit', cleanup)

// ---- the fake HOST: only the seams the preset consumes (see MEASURED BOUNDARY above) ------------------
function fakeHost({ subagents = null } = {}) {
  const tools = []
  const ctx = {
    workspace: mkroot('vmu-seams-ws-'),
    get: (name) => (name === 'subagents' ? subagents : null),
    tools: { register: async (spec) => { tools.push(spec); return () => {} } },
    effect: (fn) => fn(),
    on: () => () => {},
    systemPrompt: { section: () => () => {}, getSectionOrder: () => undefined },
    logger: { warn() {}, info() {} },
  }
  return { ctx, tools }
}

console.log('== K1: tool-face reachability ==')

// (a) the REAL entry with nothing declared satisfies the zero-mechanism red line.
{
  const h = fakeHost()
  const app = entry.apply(h.ctx, {})
  await app.ready()
  const names = h.tools.map((t) => t.name)
  ok(names.length === 1 && names[0] === 'vibe_vmu_status',
    'no declaration through the REAL entry registers exactly ONE tool (vibe_vmu_status)', JSON.stringify(names))
}

// (b) the declaration map can reach every face, and every published tool builds.
// THE EXPECTED COUNT IS DERIVED FROM THE FACE TABLE, never typed: Round 2 added five faces (chat/human/
// mailbox/panel/report), which turned a hard-coded `45` into four stale assertions - the exact class of
// number this repository keeps paying for. `FACE_KEYS`/`TOOL_FACES` are the same source the host uses.
{
  const FACES = FACE_KEYS.length
  const TOOLS = TOOL_FACES.length
  ok(FACES > 0 && TOOLS > 0 && FACES === TOOLS,
    'the face table is readable and has one key per published tool (the derived count below is not vacuous)',
    JSON.stringify({ faceKeys: FACES, toolFaces: TOOLS }))
  const kernel = createKernel({ settings: {} })
  const none = resolveFaces({ config: {}, settings: {}, kernel })
  ok(none.enabled.length === 1 && none.enabled[0] === 'status',
    'resolveFaces with nothing declared resolves only `status`', JSON.stringify(none.enabled))
  const specsNone = toolSpecs({ kernel, settings: {} })
  ok(specsNone.length === 1 && specsNone[0].name === 'vibe_vmu_status',
    'toolSpecs with nothing declared publishes exactly one tool', JSON.stringify(specsNone.map((s) => s.name)))
  // `library` is a read-only getter on the kernel, so the surface it represents is supplied read-through.
  const kernelWithLibrary = new Proxy(kernel, { get: (t, k) => (k === 'library' ? { list: async () => [] } : t[k]) })
  const all = resolveFaces({ config: {}, settings: { 'vmu.tools.faces': ['*'] }, kernel: kernelWithLibrary, scripts: [{}], packLoader: () => ({}) })
  ok(all.enabled.length === FACES,
    'vmu.tools.faces=[*] enables ALL faces the table declares when their surfaces are satisfied',
    all.enabled.length + '/' + FACES + ' enabled; unavailable=' + JSON.stringify(all.unavailable))
  const specsAll = toolSpecs({ kernel: kernelWithLibrary, settings: {}, assertDeclared: () => {}, scripts: [{ id: 's1', file: 'x.js' }], packLoader: () => ({}), faces: all })
  const got = specsAll.map((s) => s.name).sort()
  const want = TOOL_FACES.map((f) => f.name).sort()
  ok(want.length > 0 && got.length === TOOLS && want.every((n) => got.includes(n)),
    'toolSpecs builds EVERY published tool from the map (and the table really names tools)', got.length + '/' + TOOLS + ' built')
  ok(new Set(FACE_KEYS).size === FACES && new Set(want).size === TOOLS,
    'the face table keys and the tool names are each UNIQUE (a duplicate would otherwise hide a missing face)',
    String(FACES))
}

// (c) each of the three declaration sources lights its own face; refusals are NAMED.
{
  const kernel = createKernel({ settings: {} })
  const byFamily = resolveFaces({ config: {}, settings: { 'vmu.minutes.recessLimitMs': 1 }, kernel })
  ok(byFamily.enabled.includes('minutes') && byFamily.sources.minutes.startsWith('setting:vmu.minutes.'),
    'a `vmu.<family>.*` SETTING declares its face', JSON.stringify(byFamily.sources.minutes))
  const byConfig = resolveFaces({ config: { minutes: true }, settings: {}, kernel })
  ok(byConfig.enabled.includes('minutes') && byConfig.sources.minutes === 'config:minutes',
    'a `config.<face>` key declares its face', JSON.stringify(byConfig.sources.minutes))
  const byList = resolveFaces({ config: {}, settings: { 'vmu.tools.faces': ['vibe_vmu_board'] }, kernel })
  ok(byList.enabled.includes('board'),
    '`vmu.tools.faces` accepts the published TOOL NAME as well as the face key', JSON.stringify(byList.enabled))
  const off = resolveFaces({ config: { minutes: true, board: true }, settings: { 'vmu.core.facesDisabled': ['minutes', 'vibe_vmu_board', 'no-such-face'] }, kernel })
  ok(!off.enabled.includes('minutes') && !off.enabled.includes('board'),
    'facesDisabled removes faces BY NAME')
  ok(off.disabled.length === 2 && off.disabled.every((d) => d.code === 'VMU_NOT_PERMITTED'),
    'a disabled face is reported with a code, never silently dropped', JSON.stringify(off.disabled))
  ok(off.unknownDisabled.length === 1 && off.unknownDisabled[0] === 'no-such-face',
    'an unknown name in facesDisabled is REPORTED', JSON.stringify(off.unknownDisabled))
  const noRoot = resolveFaces({ config: { records: true }, settings: {}, kernel: createKernel({ settings: {} }) })
  ok(noRoot.unavailable.some((u) => u.face === 'records' && u.code === 'VMU_ENGINE_UNAVAILABLE'),
    'a declared face whose surface is missing is reported UNAVAILABLE with a code', JSON.stringify(noRoot.unavailable))
}

// (d) the real entry, every face declared, through the preset row.
{
  // A host that can start a continuable child: K1d is about the TOOL FACE; the delivery path is K3's subject.
  const h = fakeHost({ subagents: { async startContinuable() { return { childId: 'c-1' } } } })
  const app = entry.apply(h.ctx, { root: mkroot('vmu-seams-root-'), packs: ['institute-min'], scripts: [{ id: 's1', file: 's1.js' }], 'vmu.tools.faces': ['*'] })
  await app.ready()
  const names = h.tools.map((t) => t.name).sort()
  ok(TOOL_FACES.length > 0 && names.length === TOOL_FACES.length,
    'REAL entry + all-faces declaration registers EVERY published tool (count derived from the face table, and that table is non-empty)',
    names.length + '/' + TOOL_FACES.length + ': ' + names.join(','))
  ok(app.kernel.status().packPath === 'loader',
    'status().packPath reports the ONE pack path', String(app.kernel.status().packPath))
}

console.log('== K2: idempotency durable key (REAL store) ==')
{
  const store = createStore({ root: mkroot('vmu-seams-store-') })
  await store.open()
  ok(store.read(LEDGER_KEY) !== undefined,
    'the real store accepts the ledger key (' + LEDGER_KEY + '), i.e. it is no longer refused as an invalid key')
  const led = createIdempotency({ settings: {}, clock: () => 1000, store })
  led.begin({ key: 'job:1', scope: 'seams', payload: { a: 1 } })
  led.commit({ key: 'job:1', scope: 'seams', result: 'done' })
  // BOUNDED POLL, not a fixed sleep: the store serialises writes through one promise chain, so the projection
  // lands a tick later - and how many ticks depends on machine load. A fixed sleep was the probe's weak point.
  const deadline = Date.now() + 2000
  let status = led.status()
  while (status.durable !== true && Date.now() < deadline) { await new Promise((r) => setTimeout(r, 5)); status = led.status() }
  ok(status.durable === true,
    'the ledger reports durable:true through a REAL store (bounded poll)',
    JSON.stringify({ durable: status.durable, lastPatchOk: status.lastPatchOk, writeInFlight: status.writeInFlight }))
  const disk = JSON.parse(readFileSync(store.file, 'utf8'))
  ok(!!(disk.keys[LEDGER_KEY] && Array.isArray(disk.keys[LEDGER_KEY].entries) && disk.keys[LEDGER_KEY].entries.length === 1),
    'the projection is ON DISK under the ledger key', JSON.stringify(disk.keys[LEDGER_KEY]).slice(0, 160))
  const led2 = createIdempotency({ settings: {}, clock: () => 2000, store })
  const back = led2.lookup({ key: 'job:1', scope: 'seams' })
  ok(!!back && back.state === 'committed',
    'a fresh ledger instance reads the row back (the restart promise)', JSON.stringify(back))
}

console.log('== K3: turn delivery seam ==')
{
  const kernel = createKernel({ settings: {}, deliverTurn: async () => '```json\n{"task_create":{"title":"from-kernel-deliverTurn"}}\n```' })
  const st = kernel.status().seams
  ok(st.turnDeliver === true && st.turnDeliverSource === 'kernel-deliverTurn',
    'the kernel accepts a deliverTurn seam and reports WHERE it came from', JSON.stringify({ t: st.turnDeliver, s: st.turnDeliverSource }))
  const none = createKernel({ settings: {} }).status().seams
  ok(none.turnDeliver === false && /refuse by name/.test(String(none.turnDeliverNote)),
    'no seam ⇒ turnDeliver:false PLUS a note that names the refusal')
  const deliveredHere = []
  const subagents = {
    async startContinuable(spec) { deliveredHere.push(spec); return { childId: 'c-1', reply: '```json\n{"task_create":{"title":"from-host"}}\n```' } },
  }
  const h = fakeHost({ subagents })
  const app = entry.apply(h.ctx, { turn: true })
  await app.ready()
  ok(app.kernel.status().seams.turnDeliver === true,
    'the REAL entry wires a delivery seam from ctx.get(subagents)', JSON.stringify(app.kernel.status().seams.turnDeliverSource))
  const step = await app.kernel.turn.step({ members: [{ id: 'm-1' }] })
  ok(step.ok === true && step.receipt && step.receipt.executed >= 1,
    'a REAL round delivers through the seam and dispatches', JSON.stringify(step).slice(0, 220))
  ok(deliveredHere.length === 1 && deliveredHere[0].label === 'vmu-turn-' + (step.receipt && step.receipt.turn),
    'the bridge sent the ASSEMBLED text under a traceable turn label', JSON.stringify(deliveredHere[0] && deliveredHere[0].label))
  // ROUND 4 / F11: the host contract now carries the LIFECYCLE fields, so this seam answers an OBJECT
  // ({ reply, childId, stopReason, attribution }) instead of a bare string. The old shape assertion went STALE,
  // not wrong: `reply` is still the host's text, and the two fields Round 3 could not obtain (childId, stopReason)
  // are now reported together with an `attribution` saying where they came from - or why they are absent. A turn
  // that cannot be attributed says so instead of passing for an anonymous reply.
  const delivered = await deliverViaSubagents(subagents)({ turn: { id: 't9' }, text: 'x' })
  ok(delivered && typeof delivered === 'object' && typeof delivered.reply === 'string' && delivered.reply.includes('task_create'),
    'deliverViaSubagents returns the host reply (as `reply` on the lifecycle envelope)', JSON.stringify(delivered))
  ok('childId' in delivered && 'stopReason' in delivered && typeof delivered.attribution === 'string' && delivered.attribution.length > 0,
    '★ and the envelope reports childId/stopReason WITH an attribution saying where they came from (F11)',
    JSON.stringify({ childId: delivered.childId, stopReason: delivered.stopReason, attribution: delivered.attribution }))
  // NEGATIVE HALF (kept, as the Lead requires): no seam ⇒ a NAMED refusal, never a silent pass-through.
  let noSeamErr = null
  try { await deliverViaSubagents(null)({ turn: { id: 't9' }, text: 'x' }) } catch (e) { noSeamErr = e }
  ok(!!noSeamErr && noSeamErr.code === 'VMU_ENGINE_UNAVAILABLE',
    '★ and with NO subagents seam the bridge refuses BY NAME (VMU_ENGINE_UNAVAILABLE) instead of returning nothing',
    noSeamErr && { code: noSeamErr.code, message: String(noSeamErr.message).slice(0, 80) })
}

console.log('== K4: prompt settings on the REAL construction path ==')
{
  const kernel = createKernel({ settings: {
    'vmu.prompts.sections': [{ name: 'seams-section', order: 600, text: 'FROM-SETTINGS' }],
    'vmu.prompts.overrides': { 'seams-section': 'OVERRIDDEN-BY-SETTINGS' },
  } })
  const asm = await kernel.prompt.assemble({})
  ok(asm.ok === true && String(asm.text).includes('OVERRIDDEN-BY-SETTINGS'),
    'a section+override DECLARED IN SETTINGS reaches the kernel pipeline (createKernel path)', String(asm.text).slice(0, 120))
  const st = kernel.status().prompt
  ok(!!st && Array.isArray(st.sections) && st.sections.some((s) => s.name === 'seams-section'),
    'prompt.status() lists the settings-declared section')
  const bare = createKernel({ settings: {} })
  const asm2 = await bare.prompt.assemble({})
  ok(!String(asm2.text).includes('FROM-SETTINGS'),
    'with nothing declared the settings text does NOT appear (the zero-mechanism red line holds)')
}

console.log('== K5: pack merge (declaration-driven, conflicts NAMED) ==')
{
  const h = fakeHost()
  // ROUND 7 (vmu-pack's fidelity fix): the pack default for `vmu.turn.selfCheck` is now `false`, because that is
  // what v5r actually ran (`vibe-math-v5r.js:1122 resourceSelfCheck: false`) and the pack's own gate reads
  // `!== false` (`packs/v5r/middleware/prompt-switches.js:27`). The SESSION value therefore has to be `true` to
  // still be a value that DIFFERS from the default - otherwise "the session value wins" has nothing to win with.
  const app = entry.apply(h.ctx, { packs: ['v5r'], 'vmu.turn.selfCheck': true, 'vmu.packs.active': ['v5r'] })
  const m = app.packMerge()
  ok(m.priority === 'pack 默认 < preset Config／会话 settings < 运行时 set',
    'the priority ladder is stated in the merge report')
  ok(m.conflicts.some((c) => c.key === 'vmu.turn.selfCheck' && c.code === 'VMU_PACK_CONFLICT'),
    'a pack default colliding with a session value is a NAMED conflict', JSON.stringify(m.conflicts.slice(0, 2)))
  ok(m.sources['vmu.turn.selfCheck'] === 'config',
    'the session value is labelled `config` (it wins), not silently replaced')
  ok(app.kernel.status().settings.resolved['vmu.turn.selfCheck'].value === true,
    'the session value WINS in the kernel resolved view')
  const app2 = entry.apply(fakeHost().ctx, { packs: ['v5r'], 'vmu.turn.selfCheck': true, 'vmu.packs.active': ['v5r'], 'vmu.packs.activeOverrides': ['vmu.turn.selfCheck'] })
  const m2 = app2.packMerge()
  ok(m2.conflicts.length === 0 && m2.shadowed.some((s) => s.key === 'vmu.turn.selfCheck'),
    'an explicitly declared override turns the conflict into a recorded `shadowed`')
  const app3 = entry.apply(fakeHost().ctx, { packs: ['v5r'], 'vmu.packs.active': ['v5r'] })
  const m3 = app3.packMerge()
  ok(m3.sources['vmu.turn.replyCatalogue'] === 'pack:v5r',
    'a pack-default key is labelled `pack:v5r` (NOT `config`)', String(m3.sources['vmu.turn.replyCatalogue']))
  const resolved = app3.kernel.status().settings.resolved['vmu.turn.replyCatalogue']
  ok(!!resolved && resolved.source === 'pack:v5r',
    'the kernel resolved view repeats the pack layer', JSON.stringify(resolved && resolved.source))
  const app4 = entry.apply(fakeHost().ctx, {})
  ok(app4.packMerge().packs.length === 0,
    'with no config.packs the merge report names no pack')
  ok(app4.kernel.status().settings.keys === Object.keys(app4.kernel.settingsSnapshot()).length,
    'status reports the settings it was actually built with')
}

cleanup()
console.log('')
console.log('=== VMU ROUND1 SEAMS: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)
