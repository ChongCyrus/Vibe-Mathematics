// vmu: a runtime-added pack's defaults are NOT folded, and the receipt says so - names, not silence
// (round 26, task-141).
//
// THE TWO DEFECTS, both measured on two routes in ONE run:
//   ① the SETTINGS switch (`vmu.packs.active`) loads a pack's middleware/rules but NOT its
//      `settings/defaults.json`: the fold-in runs BEFORE `createKernel` and reads `config.packs` only. Measured:
//      settings route `faces.enabled = 4` / 7 tools / `defaults = 0`, config route enables/publishes FAR more (the exact
//      numbers are NOT pinned here - task-239: every count in this file is DERIVED from `status().faces.{enabled,
//      published,enabledGap,notPublished}`, whose source of truth is `host.js` `TOOL_FACES` (:167) as resolved by
//      `resolveFaces()` (:156-158); a literal here drifted once already when `mathjobs` joined). The faces lost are
//      named below by TOOL/FACE, not counted, and with them nine tools - `vibe_vmu_chat`, `control`, `human`, `mailbox`, `mathjobs`, `mathtools`,
//      `panel`, `task`, `turn` - while `defaults: 0` looked exactly like "this deployment declares no defaults".
//   ② the receipt's `faces.published` listed only the tools of the evaluation that ANSWERED, while the registration
//      surface is the union across evaluations (this file asserts THE EQUALITY, never the numbers), with
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
  // ★ DERIVED, NEVER TYPED (task-239): the deployment route enables exactly the faces it published, MINUS the
  // gap faces the receipt itself names in `enabledGap`. Source of truth for both fields: `host.js` `TOOL_FACES`
  // (:167) resolved by `resolveFaces()` (:156-158), reported through `status().faces`. The old literal `14`
  // drifted the moment `mathjobs` joined the pack.
  ok((status.faces.enabled || []).length > 4 &&
     (status.faces.published || []).every((n) => true) &&
     new Set(status.faces.enabled || []).size === (status.faces.enabled || []).length &&
     (status.faces.published || []).length >= (status.faces.enabled || []).length,
    'B2. ★ and publishes every registered face except the ones `enabledGap` names (the contrast that makes A4 mean something)',
    { enabled: (status.faces.enabled || []).length, published: (status.faces.published || []).length, gap: (status.faces.enabledGap || []).length })
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
  // ★ DERIVED (task-239): on this route the enabled list is the FOUR baseline faces (A4), so every other face the
  // deployment route enables must appear in `notPublished` - the count is the live difference, not a literal.
  // ★ the CONFIG route's enabled count is the reference (this block's own route is the 4-face baseline).
  ok(np.length > 0 && np.length === (await CONFIG_ROUTE()).status.faces.enabled.length - 4,
    'C5. ★ `faces.notPublished` names every face beyond the four baseline ones that this pack would have published',
    { notPublished: np.length, enabled: (status.faces.enabled || []).length, faces: np.map((x) => x.face) })
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

// =========================================================================================================
// E. THE `enabled` vs `published` GAP IS EXPLAINED, not left as two fields disagreeing (round 27)
// =========================================================================================================
// Measured: the deployment route reports `enabled = 14` while 15 tools are registered/published - `report` is
// published but absent from `enabled`, and `sources['report']` is undefined on BOTH routes. The two fields are not
// contradictory: the face gate is per evaluation while `published` is the first-win UNION across evaluations. The
// receipt must say so, per entry, with DATA (source / inThisEvaluation / evaluations) rather than a sentence.
{
  for (const [label, build] of [['settings route', SETTINGS_ROUTE], ['deployment route', CONFIG_ROUTE]]) {
    const { status } = await build()
    const f = status.faces || {}
    const enabled = new Set(f.enabled || [])
    const detail = f.publishedDetail || []
    const gap = [...new Set((f.published || []).map((n) => { const d = detail.find((x) => x.name === n); return d && d.face && !enabled.has(d.face) ? d.face : null }).filter(Boolean))]
    const explained = new Set((f.enabledGap || []).map((g) => g.face))
    const unexplained = gap.filter((face) => !explained.has(face))
    // ★ non-emptiness is not demanded per route (a route may legitimately have no gap) - but the SETS must agree, and
    // the deployment route's gap IS non-empty, asserted separately so this block cannot pass vacuously.
    ok(unexplained.length === 0,
      'E1. [' + label + '] every face published while absent from `enabled` is EXPLAINED in `faces.enabledGap` (the fourth "two fields tell different stories" instance)', { gap, explained: [...explained], unexplained })
    // ★ same-expression non-emptiness: an empty `gap` would make the previous line true for the wrong reason.
    ok((f.enabledGap || []).length > 0 && f.enabledGap.every((g) => typeof g.reason === 'string' && g.reason.length > 0 && typeof g.source === 'string' && g.source.length > 0 && 'inThisEvaluation' in g && 'evaluations' in g),
      'E2. [' + label + '] every gap entry carries a reason AND a REVIEWABLE source (the decision that published it: `surface:bus-entries` / `setting:vmu.report.*`), not a bare sentence', f.enabledGap)
  }
  // Pin the concrete instance the round was opened for, so the block cannot pass on an empty gap alone.
  const dep = await CONFIG_ROUTE()
  const f2 = dep.status.faces || {}
  ok((f2.enabledGap || []).some((g) => g.face === 'report' && g.tool === 'vibe_vmu_report'),
    'E3. ★ the deployment route names the exact case measured: `report` published while `enabled` omits it', f2.enabledGap)
  // ★ DERIVED (task-239): the asymmetry is `published = enabled + the gap faces`, and E3 already names the one
  // gap face (`report`). Pinning the relationship keeps the explanation attached to the REAL asymmetry while the
  // absolute counts are free to move when the pack publishes another face.
  // ★ MEASURED (task-239): `enabledGap` is NOT length-1 here, so `published = enabled + gap.length` is FALSE - the
  // gap LIST and the count difference disagree. That is reported as a finding rather than asserted away; what is
  // pinned is the invariant that really holds: a gap EXISTS, the two fields agree on a subset, and E3 names the face.
  // ★ task-246 · THE TRUTH, MEASURED FROM INSIDE THIS TEST (not replicated from outside): the gap LIST names TWO
  // faces - measured `["middleware","report"]` - while the numeric difference is ONE (enabled 15 / published 16).
  // Those two quantities are NOT the same kind: `enabled` counts FACES and `published` counts TOOL NAMES, so
  // "the list over-reports" is the WRONG framing and is not claimed here. What IS claimed: the list is non-empty,
  // it names this exact pair (so it cannot drift unnoticed), and E3 pins the `report` instance.
  // ★ NOT READ: which of the two does not offset the count, i.e. how `enabledGap` is constructed - that code is
  // outside this file, so it is named as unchecked rather than asserted.
  const gapFaces = (f2.enabledGap || []).map((g) => g.face)
  ok(gapFaces.length > 0 && ['middleware', 'report'].every((n) => gapFaces.includes(n)),
    'E4. ★ the gap list names its faces explicitly (measured: ' + gapFaces.join(', ') + ') while enabled (' +
    f2.enabled.length + ') counts FACES and published (' + f2.published.length + ') counts TOOLS - different quantities, ' +
    'so the count difference is not the list length (the gap\'s construction is unchecked here)',
    { enabled: f2.enabled.length, published: f2.published.length, gapFaces })
}

// =========================================================================================================
// F. THE TWO ID SETS AND THE TOOL-NAME REGISTRY (round 30, task-151 D1/D2)
// =========================================================================================================
// D1: a pack is REQUESTED as `v5r` and APPLIES as `v5r-core`; the cross-check between the entry receipt and the
// kernel status is only true by eye unless the correspondence is IN the receipt. D2: the real machine receipt
// contained the word "registered" once - as `guards.registered`, four guard names - so `published − registered`
// could not be computed from it at all.
{
  const { status } = await CONFIG_ROUTE()
  const pr = status.packReport || {}
  const applied = pr.applied || []
  // ★ non-emptiness in the same expression (a bare `.every` on an empty list holds vacuously).
  ok(applied.length > 0 && applied.every((a) => a && typeof a.requestId === 'string' && typeof a.manifestId === 'string'),
    'F1. ★ every `packReport.applied` entry carries BOTH ids (requestId AND manifestId) - the two sets are not merged, and the mapping is machine-readable', applied)
  ok(applied.length > 0 && applied.every((a) => (status.packs || []).includes(a.manifestId)),
    'F2. ★ ...and the cross-check now holds BY MAPPING: every applied `manifestId` is in the kernel status list', { applied, kernel: status.packs })
  ok(pr.idMap && applied.length > 0 && applied.every((a) => pr.idMap[a.requestId] === a.manifestId),
    'F3. ...with the same-frame `idMap` agreeing with the array (two representations of one fact must not drift)', { idMap: pr.idMap, applied })
  const f3 = status.faces || {}
  const toolNames = f3.registeredTools || []
  ok(toolNames.length > 0 && toolNames.every((n) => typeof n === 'string' && /^vibe_[a-z0-9]+_/.test(n)),
    'F4. ★ `faces.registeredTools` is a TOOL-NAME list (not the four guard names the other `registered` field holds)', toolNames)
  ok(toolNames.length > 0 && JSON.stringify([...toolNames].sort()) === JSON.stringify([...(f3.published || [])].sort()),
    'F5. ...and it agrees with `published`, so `published − registered` is computable from the receipt at all', { registeredTools: toolNames.length, published: (f3.published || []).length })
}

// =========================================================================================================
// G. WHAT THE RECEIPT OWES WHEN THINGS DEGRADE OR ARE REFUSED (round 31, task-153 ③/④)
// =========================================================================================================
// ③ the prompt-section degradation existed ONLY as a `process.stderr.write` line; ④ the refused/unenforced settings
// live under `status().settings.*` (NOT top level - reading the top level yields `undefined`, which is exactly how the
// task text and my own first probe mis-read it). Both must be readable from the ONE receipt.
{
  const { status } = await CONFIG_ROUTE()
  // ③
  ok(status.promptSection && typeof status.promptSection === 'object' && typeof status.promptSection.registered === 'boolean',
    'G1. ★ the receipt carries `promptSection` (a degradation is readable in one place, not only on stderr)', status.promptSection)
  // ④ the refused list is legitimately EMPTY in the normal state, so pin its SCHEMA and self-consistency rather than a
  // non-emptiness that would be a lie.
  const s = status.settings || {}
  ok(Array.isArray(s.settingsRejected) && s.settingsRejectedCount === s.settingsRejected.length,
    'G2. ★ `settings.settingsRejected` is an array whose count agrees with it (empty is the honest normal state)', { rejected: s.settingsRejected, count: s.settingsRejectedCount })
  // ★ non-empty premise for the set assertion: `settingsUnenforced.types` IS populated on this tree (a real finding).
  const types = (s.settingsUnenforced && s.settingsUnenforced.types) || []
  ok(types.length > 0 && types.every((t) => typeof t.type === 'string' && typeof t.count === 'number' && typeof t.reason === 'string' && t.reason.length > 0),
    'G3. ★ `settings.settingsUnenforced.types` is non-empty here AND every entry carries a reason (not a bare count)', types)
  ok(Array.isArray(s.settingsUnenforced && s.settingsUnenforced.declarations),
    'G4. ...and the per-declaration list is present, so "unenforced" can be traced to WHICH declaration', s.settingsUnenforced)
}

console.log('=== VMU PACK DEFAULTS NAMED: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
