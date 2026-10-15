// vmu: a runtime-added pack's defaults are NOT folded, and the receipt says so - names, not silence
// (round 26, task-141).
//
// THE TWO DEFECTS, both measured on two routes in ONE run:
//   ① the SETTINGS switch (`vmu.packs.active`) loads a pack's middleware/rules but NOT its
//      `settings/defaults.json`: the fold-in runs BEFORE `createKernel` and reads `config.packs` only. Measured:
//      settings route `faces.enabled = 4` / 7 tools / `defaults = 0`, config route `14` / 15 / `43`. Ten faces are
//      lost, and with them nine tools - `vibe_vmu_chat`, `control`, `human`, `mailbox`, `mathjobs`, `mathtools`,
//      `panel`, `task`, `turn` - while `defaults: 0` looked exactly like "this deployment declares no defaults".
//   ② the receipt's `faces.published` listed only the tools of the evaluation that ANSWERED, while the registration
//      surface is the union across evaluations: measured 15 registered vs 13 published, with
//      `vibe_vmu_middleware` / `vibe_vmu_report` unexplained.
//
// WHAT IS PINNED HERE: the receipt must NAME all four things - which defaults were folded, which were not (and why),
// which faces/tools that cost, and which tools are really registered together with the reason each one is. A
// receipt that merely counts cannot tell "nothing to do" from "something was silently skipped".
//
// ★ `execute()` ON A vmu TOOL RETURNS A JSON STRING, not an object (Object.keys gives character indices and every
// field reads as `undefined`, which looks exactly like an empty receipt).

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const ENTRY = resolve(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}

const entry = await import(pathToFileURL(ENTRY).href)

/** Assemble the real entry; returns the status receipt AND the registration surface the host really saw. */
async function assemble({ settings = {}, packs = null } = {}) {
  const registered = []
  const tools = {}
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (s) => { if (s && s.name) { registered.push(s.name); tools[s.name] = s } return () => {} } },
  }
  const dir = await mkdtemp(join(tmpdir(), 'vmu-defaults-'))
  const cfg = { clock: () => 1000000, deliver: () => {}, root: dir, vmu: { ...settings } }
  if (packs) cfg.packs = packs
  const handle = entry.apply(ctx, cfg)
  await handle.ready()
  const raw = await tools['vibe_vmu_status'].execute({})
  const status = typeof raw === 'string' ? JSON.parse(raw) : raw
  try { await rm(dir, { recursive: true, force: true }) } catch { /* going away */ }
  return { status, registered: [...new Set(registered)] }
}

const SETTINGS_ROUTE = () => assemble({ settings: { 'vmu.packs.active': ['v5r'] } })
const CONFIG_ROUTE = () => assemble({ packs: ['v5r'] })

// The nine tools the settings route loses (measured; named so a change in EITHER direction is visible).
const LOST_TOOLS = ['vibe_vmu_chat', 'vibe_vmu_control', 'vibe_vmu_human', 'vibe_vmu_mailbox', 'vibe_vmu_mathjobs',
  'vibe_vmu_mathtools', 'vibe_vmu_panel', 'vibe_vmu_task', 'vibe_vmu_turn']

// =========================================================================================================
// A. ARM ①: the SETTINGS route really loads (non-empty premise) and really loses the pack's faces/tools
// =========================================================================================================
{
  const { status, registered } = await SETTINGS_ROUTE()
  const sm = status.settingsMerge || {}
  ok(Array.isArray(sm.appliedPacks) && sm.appliedPacks.length > 0,
    'A1. non-vacuous premise: the settings switch REALLY loaded a pack (otherwise "nothing published" is trivially true)', sm.appliedPacks)
  ok(sm.defaults === 0, 'A2. the settings route folds no default keys (`defaults` stays 0)', sm.defaults)
  const reg = new Set(registered)
  const lost = LOST_TOOLS.filter((t) => !reg.has(t))
  // ★ non-emptiness in the SAME expression (RULE E shape B): `LOST_TOOLS` is a constant, so comparing two lengths
  // whose BOTH sides could be zero would hold vacuously. It also pins the premise the assertion rests on.
  ok(LOST_TOOLS.length > 0 && lost.length === LOST_TOOLS.length,
    'A3. ★ and the nine tools that depend on those keys are NOT registered (this is the cost, not a count)', { registered: registered.length, lost })
  ok((status.faces.enabled || []).length === 4,
    'A4. the enabled face list is the four baseline faces - no pack face survives', status.faces.enabled)
}

// =========================================================================================================
// B. ARM ②: the deployment route publishes them, so the two routes really are two DIFFERENT states
// =========================================================================================================
{
  const { status, registered } = await CONFIG_ROUTE()
  const sm = status.settingsMerge || {}
  ok(sm.defaults > 0, 'B1. the deployment route folds the pack defaults', sm.defaults)
  ok((status.faces.enabled || []).length === 14,
    'B2. ★ and publishes 14 faces (the contrast that makes A4 mean something)', status.faces.enabled)
  const reg = new Set(registered)
  ok(LOST_TOOLS.every((t) => reg.has(t)),
    'B3. ★ the nine tools ARE registered on this route', { registered: registered.length })
}

// =========================================================================================================
// C. ARM ③: the DIFFERENCE IS NAMED - folded / unfolded(+why) / which faces and tools it cost
// =========================================================================================================
{
  const { status } = await SETTINGS_ROUTE()
  const sm = status.settingsMerge || {}
  const unfolded = sm.defaultsUnfolded || []
  ok(Array.isArray(sm.defaultsFolded) && sm.defaultsFolded.length === 0,
    'C1. `defaultsFolded` is present and empty here - the receipt states it positively, not by omission', sm.defaultsFolded)
  ok(unfolded.length > 0 && unfolded.some((u) => u.id === 'v5r'),
    'C2. ★ `defaultsUnfolded` NAMES the pack whose defaults were not folded (so `defaults: 0` can no longer mean two different things)', unfolded.map((u) => u.id))
  ok(unfolded.length > 0 && unfolded.every((u) => typeof u.reason === 'string' && u.reason.length > 0),
    'C3. ★ and every entry carries a reason (not a bare id)', unfolded)
  ok(unfolded.length > 0 && unfolded.every((u) => Array.isArray(u.keys) && u.keys.length > 0),
    'C4. ...plus the key list, so the faces they would have declared can be derived rather than guessed', unfolded)
  const np = status.faces.notPublished || []
  ok(np.length === 10, 'C5. ★ `faces.notPublished` names all ten faces that this pack would have published', np.map((x) => x.face))
  // ★ non-emptiness inside the SAME expression: `[].every(…)` is vacuously true.
  ok(np.length > 0 && np.every((x) => typeof x.reason === 'string' && x.reason.length > 0 && typeof x.tool === 'string'),
    'C6. ★ and every entry names its face, its tool AND a reason (no static bucket: an entry without a reason would be a hiding place)', np)
  ok(np.some((x) => x.face === 'task' && x.tool === 'vibe_vmu_task'),
    'C7. the naming is specific enough to point at the tool the operator is missing', np.filter((x) => x.face === 'task'))
  // The deployment route must NOT invent missing faces: a false alarm here would make the field useless.
  const other = await CONFIG_ROUTE()
  ok((other.status.faces.notPublished || []).length === 0,
    'C8. ★ the deployment route reports NO missing faces (the field is a finding, not a constant)', other.status.faces.notPublished)
}

// =========================================================================================================
// D. ARM ④ (v): the receipt covers the REGISTRATION SURFACE, and every tool carries a reason
// =========================================================================================================
{
  for (const [label, build] of [['settings route', SETTINGS_ROUTE], ['deployment route', CONFIG_ROUTE]]) {
    const { status, registered } = await build()
    const f = status.faces || {}
    const published = f.published || []
    // (甲) the equality that was 15 vs 13 before this round - now the confining assertion, as agreed.
    ok(JSON.stringify([...published].sort()) === JSON.stringify([...registered].sort()),
      'D1. ★ [' + label + '] `faces.published` IS the registration surface (was 15 vs 13 on this tree)', { published: published.length, registered: registered.length })
    const detail = f.publishedDetail || []
    const unexplained = published.filter((n) => { const d = detail.find((x) => x.name === n); return !d || !d.reason })
    ok(unexplained.length === 0,
      'D2. ★ [' + label + '] every published tool is EXPLAINED by a reason - the unexplained set is empty', unexplained)
    ok(f.evaluations === 2,
      'D3. [' + label + '] the receipt self-accounts how many evaluations it merged (so the union is auditable, not asserted)', f.evaluations)
  }
}

console.log('=== VMU PACK DEFAULTS NAMED: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
