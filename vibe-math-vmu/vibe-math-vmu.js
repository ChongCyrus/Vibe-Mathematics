// vibe-math-vmu — the vmu (vibe-math-unify) agent preset entry point.
//
// Runtime mechanism = this framework + settings + middleware (+ agent self-organisation). The framework
// provides CAPABILITIES; every policy lives in settings, middleware or a pack (docs/01 R1).
//
// WHAT THIS FILE DOES NOW (and what it deliberately does not):
//   · it ASSEMBLES the kernel (kernel/index.js) from plain config data and attaches it to the host's tool
//     surface (host.js), each registration wrapped in `ctx.effect(..., label)` with a cleanup, because the
//     host's own guidance requires exactly that (recon: host-plugin.md:54);
//   · it keeps the first promise IN THE HOST: with no configuration the preset exposes exactly ONE tool,
//     `vibe_vmu_status`, and with `vmu.core.enabled=false` it exposes NONE. Nothing is subscribed, nothing
//     is injected, no state is written;
//   · it does NOT declare a `Config` (Schemastery) export: that would require a static host import, and this
//     repository must stay loadable by plain Node (the same reason settings/schema.js takes an injected
//     carrier). Settings therefore arrive as plain data under `config.vmu`, and any host-side settings
//     service remains an optional, opportunistic seam;
//   · it does NOT reach for the math host seam: `createKernel` is given no host, so the math surface stays
//     unavailable and refuses BY NAME. Wiring a real subprocess seam is a separate, explicit step.

import { decideSections as V5R_DECIDE_SECTIONS } from './packs/v5r/middleware/prompt-switches.js'
import { inboxBlock as V5R_INBOX_BLOCK } from './packs/v5r/notices.js'
import { V5R_PHASES } from './packs/v5r/index.js'
import { createChildrenPort } from './host-children.js'
import { createKernel } from './kernel/index.js'
// ★ A1 step 1 · Part B: the report-feedback DELIVERY call. It lives in a module of its own (this file is at its
// 1200-line budget, and the call carries enough reasoning to belong there); the entry passes its own `ctx`/`effect` down.
import { deliverReportFeedbackFrom } from './kernel/reportfeedbackdelivery.js'
import { deliverViaSubagents, deliverByReturning, sendViaSubagents, interruptViaSubagents } from './kernel/turn/index.js'
import { createTurnDeliver } from './host-deliver.js'
import { createHostAdapter } from './host.js'
import { attachHostHooks } from './host-hooks.js'
import { createPackLoader } from './kernel/pack.js'
// ROUND 1 / K5 (D-02): a NAMESPACE import as well, so `composePromptPolicies` can be feature-detected. A named import
// of an export that does not exist yet throws at MODULE LOAD time, which would take the whole preset down; the
// namespace form degrades to the per-pack first-wins fallback below instead.
import * as packModule from './kernel/pack.js'
import { createHostSpawn, hasHostSpawn } from './host-spawn.js'
import { createHostMath } from './host-math.js'
// ROUND 2 (task-14): the id counters are read back AFTER the store opens (the minter itself is bound inside the kernel).
import { hydrateIds } from './kernel/ids.js'
import { assertDeclared } from './settings/schema.js'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { basename, isAbsolute, join, dirname } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'

export const name = 'vibe-math-vmu'

/** Public-interface version of this preset's exposed surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

/**
 * Required host services. Only the tool surface is required (without it there is nothing to attach to);
 * everything else - prompts, settings, presets - is consumed opportunistically so the preset still loads
 * in a minimal deployment instead of failing to activate.
 */
export const inject = ['tools']

/** The shape a dotted settings key must have (a `vmu.*` path of plain identifiers). */
const SETTING_KEY_SHAPE = /^vmu\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype

/**
 * U14 / Round 6 — THE TWO DECLARATION SHAPES, ONE ENTRY. Measured failure that made this necessary: the overlay
 * recipe declares the NESTED form (`config.vmu = { tools: { faces: ['*'] }, packs: { active: ['v5r'] } }`), while the
 * reader only kept keys starting with `vmu.` ⇒ `tools`/`packs`/`report` were dropped ⇒ the declaration reached the
 * inner row and was **silently discarded** (the Round-5 live session saw only `vibe_vmu_status`).
 *
 *  ① NESTED  `config.vmu = { tools: { faces: ['*'] }, packs: { active: ['v5r'] } }`  → flattened to dotted keys
 *  ② DOTTED  `config.vmu = { 'vmu.tools.faces': ['*'], 'vmu.packs.active': ['v5r'] }` → taken as-is
 *  A FLAT `config` (no `vmu` key) is also accepted; there only `vmu.*` keys are settings (everything else is host
 *  config - `root`, `clock`, `scripts`, `packs`, `deliver`, … - so it must NOT be reported as unparsed).
 *
 * NOTHING IS DROPPED SILENTLY. Every entry that cannot become a setting is returned in `unparsed` with a reason, and
 * a key reachable from BOTH shapes is returned in `conflicts` (the DOTTED form wins - explicit beats inferred - and
 * the fact is named rather than quietly resolved).
 *
 * @returns {{ settings: object, unparsed: Array<{path: string, why: string}>, conflicts: Array<{key: string, why: string}> }}
 */
function readSettings(config) {
  const settings = {}
  const unparsed = []
  const conflicts = []
  if (!config || typeof config !== 'object') return { settings, unparsed, conflicts }
  const namespace = config.vmu
  let raw = config
  let namespaced = false
  if (namespace !== undefined) {
    if (isPlainObject(namespace)) { raw = namespace; namespaced = true }
    else unparsed.push({ path: 'vmu', why: 'not a plain object: expected a nested settings tree or dotted `vmu.*` keys' })
  }
  // ①/② pass one: every DOTTED key, in both shapes.
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k !== 'string' || !k.startsWith('vmu.')) continue
    if (!SETTING_KEY_SHAPE.test(k)) unparsed.push({ path: k, why: 'not a dotted settings key (expected vmu.<name>[.<name>…])' })
    else settings[k] = v
  }
  // ① pass two: the NESTED tree (namespaced form only) → dotted keys.
  if (namespaced) {
    const nested = {}
    const flatten = (node, prefix) => {
      if (isPlainObject(node)) {
        const keys = Object.keys(node)
        if (keys.length === 0) { unparsed.push({ path: prefix, why: 'empty object leaf: it declares nothing (name the key you meant, e.g. ' + prefix + '.<name>)' }); return }
        for (const k of keys) {
          if (typeof k !== 'string' || k === '') { unparsed.push({ path: prefix + '.<empty>', why: 'empty key inside the nested tree' }); continue }
          flatten(node[k], prefix + '.' + k)
        }
        return
      }
      if (typeof node === 'function') { unparsed.push({ path: prefix, why: 'not a settings value (function)' }); return }
      if (node !== null && typeof node === 'object' && !Array.isArray(node)) { unparsed.push({ path: prefix, why: 'not a settings value (class instance / non-plain object)' }); return }
      if (prefix.indexOf('vmu.') !== 0 || !SETTING_KEY_SHAPE.test(prefix)) { unparsed.push({ path: prefix, why: 'flattened to a key that is not a dotted settings path' }); return }
      nested[prefix] = node
    }
    for (const [k, v] of Object.entries(raw)) {
      if (typeof k === 'string' && k.startsWith('vmu.')) continue   // pass one already took it
      if (typeof k !== 'string' || k === '') { unparsed.push({ path: String(k), why: 'empty key inside config.vmu' }); continue }
      flatten(v, 'vmu.' + k)
    }
    for (const [k, v] of Object.entries(nested)) {
      if (Object.prototype.hasOwnProperty.call(settings, k)) {
        conflicts.push({ key: k, why: 'declared BOTH as a dotted key and inside the nested tree; the DOTTED key wins (explicit beats inferred) - this is named, not silently resolved' })
        continue
      }
      settings[k] = v
    }
  }
  return { settings, unparsed, conflicts }
}

/**
 * Plugin entry point. Returns a handle for tests and diagnostics; the host only needs the effects.
 *
 * @param {object} ctx     Cordis context for this plugin row.
 * @param {object} config  The row's `config` (plain data; see the header for why there is no `Config`).
 */
export function apply(ctx, config = {}) {
  const parsed = readSettings(config)
  const settings = parsed.settings
  // ★ NOTHING IS DROPPED SILENTLY (Round 6 B): an entry that cannot become a setting, or a key declared twice in two
  // shapes, is NAMED on the host logger AND on stderr, and it is self-disclosed through the handle
  // (`settingsUnparsed` / `settingsConflicts`, and inside `status()`), so "the declaration did not take" is answerable.
  const settingsUnparsed = parsed.unparsed.slice()
  const settingsConflicts = parsed.conflicts.slice()
  const warnSettings = (kind, item) => {
    const line = '[dsh-vibe-math] ' + kind + ': ' + String(item.path === undefined ? item.key : item.path) + ' — ' + String(item.why)
    try { ctx.logger?.warn?.(line) } catch { /* a failed warning must never fail the boot */ }
    try { process.stderr.write('vmu: ' + line + '\n') } catch { /* stderr may be gone */ }
  }
  for (const u of settingsUnparsed) warnSettings('settings-unparsed', u)
  for (const c of settingsConflicts) warnSettings('settings-conflict', c)
  const root = typeof config.root === 'string' && config.root.length > 0 ? config.root : null
  const clock = typeof config.clock === 'function' ? config.clock : undefined

  // M3 SCRIPT BRIDGE: the subprocess seam is bound whenever the context CAN carry services, and it resolves
  // the host's service AT CALL TIME (a plugin's apply can run before the service mounts; binding "absent" at
  // that instant would refuse every script run forever). Without a service the run refuses by name.
  let spawnSeam = null
  let spawnError = null
  if (ctx && typeof ctx.get === 'function') {
    try { spawnSeam = createHostSpawn({ ctx, defaultCwd: typeof config.workspace === 'string' ? config.workspace : null, settings, root }) }
    catch (e) { spawnError = { code: (e && e.code) || 'VMU_ENGINE_UNAVAILABLE', message: String((e && e.message) || e) } }
  }
  // ---- PROMPT MANAGEMENT (the user's explicit clause: 通过 settings/中间件 设置·安排·管理·编辑提示词) --------
  // Sections come from the plugin's config (`promptSections`, or the legacy single `prompt` string); bindings
  // come from `config.promptBindings` OR the declared setting `vmu.prompts.bindings`; overrides come from
  // `config.promptOverrides` OR from the declared `vmu.prompts.overridesDir` (relative to `root`). The
  // EFFECTIVE text (override > section file > inline) is what the HOST systemPrompt section receives, because
  // the pipeline alone would assemble text nobody sees.
  const readRel = (rel) => {
    try { const p = root && !isAbsolute(rel) ? join(root, rel) : rel; return readFileSync(p, 'utf8') } catch { return null }
  }
  const promptSections = (() => {
    const out = []
    if (typeof config.prompt === 'string' && config.prompt.length > 0) out.push({ name: 'vmu', text: config.prompt })
    const list = config.promptSections
    if (Array.isArray(list)) {
      for (const s of list) if (s && typeof s.name === 'string') out.push(s)
    } else if (list && typeof list === 'object') {
      for (const [name, v] of Object.entries(list)) {
        if (typeof v === 'string') out.push({ name, text: v })
        else if (v && typeof v === 'object') {
          out.push({ name, text: typeof v.text === 'string' ? v.text : undefined,
            file: typeof v.file === 'string' ? v.file : undefined, order: v.order })
        }
      }
    }
    return out
  })()
  // RESOURCE SECTION (docs/04 §11, `vmu.prompts.resourceSection`): default false means the prompt is BYTE-FOR-
  // BYTE unchanged - the section is added only when the configuration asks for it. Its text is derived from the
  // MECHANISM settings (not from live counters), so it states the budget the run is operating under instead of
  // pretending to be a live dashboard.
  if (settings['vmu.prompts.resourceSection'] === true) {
    const cap = (v) => (Number(v) > 0 ? String(Number(v)) : '不限')
    promptSections.push({
      name: 'resources',
      order: 900,
      source: 'settings:vmu.prompts.resourceSection',
      text: '【资源】在役成员上限=' + cap(settings['vmu.limits.maxLiveMembers'] || settings['vmu.limits.maxParallel']) +
        '；任务上限=' + cap(settings['vmu.tasks.maxOpenTasks']) +
        '；单回合工具上限=' + cap(settings['vmu.limits.toolCallsPerTurnCap']) +
        '；墙钟预算=' + (Number(settings['vmu.limits.wallClockMs']) > 0 ? Number(settings['vmu.limits.wallClockMs']) + 'ms' : '不限') +
        '；数学面=' + String(settings['vmu.math.computation'] || 'auto') +
        '；整合包=' + (Array.isArray(settings['vmu.packs.active']) && settings['vmu.packs.active'].length
          ? settings['vmu.packs.active'].join('／') : '无'),
    })
  }
  const promptOverrides = Object.assign({},
    config.promptOverrides && typeof config.promptOverrides === 'object' ? config.promptOverrides : {})
  const overridesDir = typeof settings['vmu.prompts.overridesDir'] === 'string' ? settings['vmu.prompts.overridesDir'] : null
  if (overridesDir) {
    for (const s of promptSections) {
      const text = readRel(join(overridesDir, s.name + '.md'))
      if (typeof text === 'string') promptOverrides[s.name] = text
    }
  }
  const promptBindings = Array.isArray(config.promptBindings) ? config.promptBindings
    : (Array.isArray(settings['vmu.prompts.bindings']) ? settings['vmu.prompts.bindings'] : [])
  const whoMayOverride = Array.isArray(config.whoMayOverride) ? config.whoMayOverride
    : (Array.isArray(settings['vmu.prompts.whoMayOverride']) ? settings['vmu.prompts.whoMayOverride'] : ['office'])
  const effectivePrompts = promptSections.map((s) => {
    const overridden = typeof promptOverrides[s.name] === 'string'
    const fromFile = typeof s.file === 'string'
    return {
      name: s.name,
      order: Number.isInteger(s.order) ? s.order : 600,
      text: overridden ? promptOverrides[s.name] : (typeof s.text === 'string' ? s.text : (fromFile ? (readRel(s.file) || '') : '')),
      source: overridden ? 'override' : (fromFile ? 'file' : 'inline'),
    }
  }).filter((s) => s.text.length > 0)

  // ROUND 2 (task-14, vmu-assistant's §5.2): THE ROOT PERSONA AS PACK DATA. `packs/<name>/prompts/assistant.json`
  // carries sections meant for the ROOT system prompt (`hostPrompt: true`); they are read the same way the turn-side
  // `sections.json` is read - as DATA, before the kernel exists - but they join `effectivePrompts` (the host section)
  // rather than the pipeline's section list, which is what makes the assistant persona really appear in a session.
  // Deliberately NOT `prompts/sections.json`: `tests/vmu-corpus-is-baseline-not-template.test.mjs` asserts v5r has no
  // such file (the corpus is a baseline, not a runtime template), and that boundary is not mine to move.
  {
    const here = dirname(fileURLToPath(import.meta.url))
    const wanted = Array.isArray(config.packs) ? config.packs.filter((p) => typeof p === 'string') : []
    for (const name of wanted) {
      try {
        const parsed = JSON.parse(readFileSync(join(here, 'packs', name, 'prompts', 'assistant.json'), 'utf8'))
        for (const s of (parsed && Array.isArray(parsed.sections) ? parsed.sections : [])) {
          if (!s || typeof s.name !== 'string' || typeof s.text !== 'string') continue
          if (s.hostPrompt !== true) continue
          effectivePrompts.push({ name: s.name, order: Number.isFinite(s.order) ? s.order : 500, text: s.text, source: 'pack:' + name })
        }
      } catch (e) {
        // ONLY a missing file is expected (a pack with no root-persona data). Anything else is a real error and must
        // not be swallowed - the same discipline the `sections.json` reader above follows.
        const missing = e && (e.code === 'ENOENT' || e.code === 'ERR_MODULE_NOT_FOUND')
        if (!missing) throw e
      }
    }
  }

  // V9 MATH: the shared `math_computation` module reaches the host through an injected seam. Until now only a
  // TEST fake provided one, so the math domain and its settings were unreachable in a real session. The
  // adapter is built here, and `vmu.math.computation: 'off'` keeps it out entirely (zero mechanism).
  // Declaring math INTENT is what switches the domain on (`config.math`, or any declared `vmu.math.*` key).
  // No declaration ⇒ no math tool, exactly like scripts/packs/middleware: a default value is not a
  // declaration, and the zero-mechanism proof ("one read-only tool") must survive (docs/11 §7).
  const mathDeclared = config.math !== undefined || Object.keys(settings).some((k) => k.startsWith('vmu.math.'))
  let mathHost = null
  if (mathDeclared && settings['vmu.core.enabled'] !== false && ctx && ctx.tools && typeof ctx.tools.register === 'function' && settings['vmu.math.computation'] !== 'off') {
    try {
      mathHost = createHostMath({
        ctx, settings,
        projectRoot: typeof config.workspace === 'string' ? config.workspace : null,
        log: (m) => { try { process.stderr.write('vmu ' + String(m) + '\n') } catch { /* stderr may be gone */ } },
      })
    } catch (e) { mathHost = null }
  }

  // GOAL 2: A PACK'S settings/ FOLDER STATES WHAT IT WANTS THE KNOBS TO BE. The kernel reads settings when it is
  // constructed and a pack is applied afterwards (its own comment explains why), so a pack's defaults must be folded
  // in BEFORE construction. They are read as pure DATA - settings/defaults.json - both because a plugin top level
  // cannot await a dynamic import and because a settings default is data rather than code.
  // The user's own settings always WIN: a pack states a preference, it does not override a deployment. And the
  // merged object is used ONLY for the kernel: `declared` below still counts the USER's keys, so a deployment that
  // configured nothing keeps the documented "zero mechanism" behaviour rather than becoming declared by its pack.
  const packDefaults = {}
  // ROUND 26 / task-141 — WHICH pack defaults were folded, and WHICH were NOT. Named on purpose: the fold-in runs
  // BEFORE `createKernel` and its input set is `config.packs` ONLY, so a pack added at runtime (`vmu.packs.active`)
  // can never have its `settings/defaults.json` folded. That is structural, not an oversight - and the receipt must
  // SAY it, because `defaults: 0` alone is indistinguishable from "this deployment declares no defaults at all",
  // which is how a runtime-loaded pack's faces (and therefore its tools) went unnoticed.
  const defaultsFoldedIds = []
  const defaultsUnfolded = []
  {
    const hereU = dirname(fileURLToPath(import.meta.url))
    const activeIds = Array.isArray(settings['vmu.packs.active']) ? settings['vmu.packs.active'].filter((p) => typeof p === 'string') : []
    const declaredStrings = Array.isArray(config.packs) ? config.packs.filter((p) => typeof p === 'string') : []
    for (const id of activeIds) {
      if (declaredStrings.includes(id)) continue          // declared in BOTH ⇒ the deployment route folds it
      let keys = null
      try {
        const parsed = JSON.parse(readFileSync(join(hereU, 'packs', id, 'settings', 'defaults.json'), 'utf8'))
        keys = parsed && typeof parsed.defaults === 'object' && parsed.defaults ? Object.keys(parsed.defaults) : []
      } catch { keys = null }                             // no defaults.json ⇒ nothing to fold (NOT a miss)
      if (keys && keys.length > 0) {
        defaultsUnfolded.push({
          id, keys,
          reason: 'a pack added at runtime cannot fold its settings/defaults.json: the fold-in runs BEFORE createKernel and reads config.packs only, and the settings face is already built',
        })
      }
    }
  }
  // ROUND 1 / K5: the merge bookkeeping. `packDefaultSource` names WHICH pack stated a default (so a collision has two
  // names, never "the pack"), and the two arrays are the auditable outcome of the D-02 priority rule (conflicts are
  // refusals-by-name, `shadowed` is a declared override the deployment asked for).
  const packDefaultSource = {}
  const packMergeConflicts = []
  const packDefaultShadowed = []
  // A PACK CONTRIBUTES PROMPT TEXT AS DATA. Sections and bindings must exist when the kernel is constructed, and this
  // top level cannot await a dynamic import - so a pack that wants to contribute prompt material declares it as DATA in
  // its own folder, exactly the way it already declares settings defaults. `sections.json` holds the pipeline's own
  // shape: { "sections": [{ name, order, range, text }], "bindings": [{ section, role|phase|member, text }] }.
  // This is what makes a SECOND pack possible without touching this plugin: it reads its own data, and the plugin
  // merges it in. The v5r pack keeps its hand-written modules because they carry logic (choose per role and phase),
  // while a pack that only needs text needs only data.
  const packSections = []
  const packBindings = []
  {
    const here = dirname(fileURLToPath(import.meta.url))
    const wantedPacks = Array.isArray(config.packs) ? config.packs.filter((p) => typeof p === 'string') : []
    for (const name of wantedPacks) {
      try {
        const parsed = JSON.parse(readFileSync(join(here, 'packs', name, 'prompts', 'sections.json'), 'utf8'))
        for (const s of (parsed && Array.isArray(parsed.sections) ? parsed.sections : [])) {
          if (!s || typeof s.name !== 'string' || typeof s.text !== 'string') continue
          packSections.push({ name: s.name, order: Number.isFinite(s.order) ? s.order : 999, range: typeof s.range === 'string' ? s.range : 'pack', source: 'pack:' + name, text: s.text })
        }
        for (const b of (parsed && Array.isArray(parsed.bindings) ? parsed.bindings : [])) {
          if (!b || typeof b.section !== 'string' || typeof b.text !== 'string') continue
          const dims = {}
          for (const d of ['role', 'phase', 'member', 'task']) if (typeof b[d] === 'string' && b[d]) dims[d] = b[d]
          if (!Object.keys(dims).length) continue
          packBindings.push(Object.assign({ section: b.section, text: b.text }, dims))
        }
      } catch (e) {
        // Only a MISSING file is expected (a pack that contributes no prompt data). Anything else is a real error:
        // a malformed sections file would otherwise silently contribute nothing, which is the failure this project
        // keeps finding in other clothes.
        const missing = e && (e.code === 'ENOENT' || e.code === 'ERR_MODULE_NOT_FOUND')
        if (!missing) throw e
      }
    }
  }
  {
    const here = dirname(fileURLToPath(import.meta.url))
    const wantedPacks = Array.isArray(config.packs) ? config.packs.filter((p) => typeof p === 'string') : []
    for (const name of wantedPacks) {
      try {
        const parsed = JSON.parse(readFileSync(join(here, 'packs', name, 'settings', 'defaults.json'), 'utf8'))
        const d = parsed && typeof parsed.defaults === 'object' && parsed.defaults ? parsed.defaults : {}
        for (const [k, v] of Object.entries(d)) {
          if (packDefaults[k] === undefined) { packDefaults[k] = v; packDefaultSource[k] = name; continue }
          // TWO PACKS WANT DIFFERENT DEFAULTS FOR ONE KEY: that is a declaration conflict, not a coin toss (D-02).
          if (JSON.stringify(packDefaults[k]) !== JSON.stringify(v)) {
            packMergeConflicts.push({ key: k, pack: name, otherPack: packDefaultSource[k], packValue: v, otherValue: packDefaults[k], code: 'VMU_PACK_CONFLICT' })
          }
        }
        defaultsFoldedIds.push(name)      } catch (e) {
        // Only a MISSING file is expected (a flat pack has no settings folder). Anything else is a real error and
        // must not be swallowed: a malformed defaults file would otherwise silently contribute no defaults at all.
        const missing = e && (e.code === 'ENOENT' || e.code === 'ERR_MODULE_NOT_FOUND')
        if (!missing) throw e
      }
    }
  }
  // ROUND 1 / K5 (D-02): ONE PRIORITY, AND AN OVERLAP IS NAMED. The order is `pack 默认 < preset Config／会话 settings
  // < 运行时 set` - so the session's value always wins and a pack default is only a preference. What this used to do
  // was `Object.assign({}, packDefaults, settings)`, which let a pack's default and a deployment's explicit value
  // COLLIDE IN SILENCE (the pack default simply disappeared). The collision is now reported by name, and only the two
  // declared doors (`vmu.packs.allowKernelOverride` / `allowOverride`, or naming the key in
  // `vmu.packs.activeOverrides`) open it - exactly the rule `kernel/pack.js` applies to its own settings layer (O4).
  /** The declared doors, as one predicate: the same three the loader honours. */
  const packOverrideDeclared = (key) => settings['vmu.packs.allowKernelOverride'] === true
    || settings['vmu.packs.allowOverride'] === true
    || (Array.isArray(settings['vmu.packs.activeOverrides']) && settings['vmu.packs.activeOverrides'].includes(key))
  for (const k of Object.keys(packDefaults)) {
    if (!Object.prototype.hasOwnProperty.call(settings, k)) continue
    if (JSON.stringify(settings[k]) === JSON.stringify(packDefaults[k])) continue
    if (packOverrideDeclared(k)) { packDefaultShadowed.push({ key: k, pack: packDefaultSource[k], packValue: packDefaults[k], sessionValue: settings[k], door: 'declared' }); continue }
    packMergeConflicts.push({ key: k, pack: packDefaultSource[k], packValue: packDefaults[k], sessionValue: settings[k], code: 'VMU_PACK_CONFLICT',
      hint: 'the session value WINS (pack 默认 < preset Config／会话 settings); to accept the pack value on purpose, list "' + k + '" in vmu.packs.activeOverrides (or set vmu.packs.allowKernelOverride) - O4 forbids a silent collision' })
  }
  const settingsWithPackDefaults = Object.assign({}, packDefaults, settings)
  // Where each merged key CAME FROM, so the resolved view never calls a pack default "config" (the entry is the only
  // layer that knows this; the kernel sees one flat object). Consumed by kernel.status().settings.resolved.
  const settingsSources = {}
  for (const k of Object.keys(packDefaults)) if (!Object.prototype.hasOwnProperty.call(settings, k)) settingsSources[k] = 'pack:' + packDefaultSource[k]
  for (const k of Object.keys(settings)) settingsSources[k] = 'config'
  // ROUND 4 / task-25 D — **REVERTED BY LEAD RULING**: an earlier version of this block MIRRORED the two
  // `math*maxParallel` spellings into one value. That was WRONG: they are two DIFFERENT policies.
  // `vmu.math.maxParallel` is the MATH-RUN concurrency (jobs/compilation; v5r's `leanJobsMaxParallel: 1`), while
  // "wake at most 3 members per round" is a MEMBER policy that belongs to `vmu.limits.maxLiveMembers`. Forcing two
  // different policies to be equal would silently move the member limit with a math knob. The two names therefore stay
  // SEPARATE, and the older jobs-scoped spelling is gone from the schema rather than kept as a silently-diverging alias
  // (the key name is deliberately NOT repeated here: a runtime-read audit scans this file as TEXT, and a comment that
  // spells a removed key would look like a read).
  // ROUND 1 / K3: THE TURN DELIVERY SEAM IS ASSEMBLED HERE, because "capability in the kernel, assembly in the host"
  // is the boundary this file already owns (see the spawn seam above). `kernel/turn/index.js` ships the real bridge
  // `deliverViaSubagents`, and this was the missing line: `createKernel` was handed `host: mathHost`, whose adapter
  // has no `deliverTurn`, so `vibe_vmu_turn` step/drive refused by name on every real host.
  // The service is resolved AT CALL TIME (the same lesson the spawn seam records at :72): a plugin's `apply` can run
  // before the subagents service mounts, and binding "absent" at this instant would refuse every turn forever.
  // ★★★ ROUND 81: THE DELIVERY ASSEMBLY MOVED TO ITS OWN MODULE (host-deliver.js). The entry is under the recorded
  // line limit again, and the concern - which route runs and the seam that runs it - now lives with itself.
  const turnDeliver = createTurnDeliver({ ctx, config, settings, deliverViaSubagents, deliverByReturning })
  const resolveSubagents = () => {
    try { return ctx && typeof ctx.get === 'function' ? ctx.get('subagents') : null } catch { return null }
  }
  const sendMessage = async (args = {}) => {
    const subs = resolveSubagents()
    if (!subs || typeof subs.sendMessage !== 'function') {
      const err = new Error('the host exposes no subagents.sendMessage, so a running member cannot be reached')
      err.code = 'VMU_ENGINE_UNAVAILABLE'
      err.hint = 'the loop refuses by name rather than pretending the message was delivered (docs/26 §3.22)'
      throw err
    }
    return sendViaSubagents(subs)(args)
  }
  const interrupt = (args = {}) => {
    const subs = resolveSubagents()
    if (!subs || typeof subs.interrupt !== 'function') {
      const err = new Error('the host exposes no subagents.interrupt, so a running member cannot be stopped')
      err.code = 'VMU_ENGINE_UNAVAILABLE'
      err.hint = 'the loop refuses by name rather than pretending the member stopped (docs/26 §3.22)'
      throw err
    }
    return interruptViaSubagents(subs)(args)
  }
  // ROUND 4 / task-25 (reader-a's 5②) — EXTRACTED IN PHASE 6 ROUND 4 to `./host-children.js` when the entry crossed the
  // recorded 1200-line ceiling (docs/02 §7; the same reason `host-deliver.js` was split in Round 81). The port is
  // unchanged: `parentId()` names the parent the roster is reconciled against, and `list()` reads the host's durable
  // direct-child directory (`subagents.listChildren`, which does NOT load or resume an Agent). A host without it yields
  // the NAMED `VMU_RESUME_CHILDREN_UNAVAILABLE`; recovery still succeeds - it just says the roster could not be checked.
  const children = createChildrenPort({ ctx, resolveSubagents })
  // ROUND 1 / K5 + P6 (D-02, vmu-pack interface): A PACK'S PROMPT MACHINERY IS DECLARED, NOT HARD-WIRED. The v5r
  // prompt switches / notice block / phases used to be injected unconditionally, so the framework's own policy ran in
  // a deployment that declared NO pack - the opposite of "零机制". They are now keyed by the pack ids this row
  // declares (`config.packs`), which is the same switch that folds in a pack's settings and prompt text.
  const PACK_RUNTIME = Object.freeze({
    v5r: { sectionPolicy: V5R_DECIDE_SECTIONS, noticeBlock: V5R_INBOX_BLOCK, phases: V5R_PHASES },
  })
  const wantedPackIds = Array.isArray(config.packs) ? config.packs.filter((p) => typeof p === 'string') : []
  const packRuntime = wantedPackIds.map((id) => PACK_RUNTIME[id]).filter(Boolean)
  const packSectionPolicies = packRuntime.map((r) => r.sectionPolicy).filter(Boolean)
  const composePromptPolicies = typeof packModule.composePromptPolicies === 'function' ? packModule.composePromptPolicies : null
  // With the composer available, several packs' policies combine; without it (not landed yet) the first wins, which is
  // the same behaviour a single-pack deployment gets. NO packs ⇒ null, so nothing switches a section (zero mechanism).
  const sectionPolicy = packSectionPolicies.length === 0 ? null
    : (composePromptPolicies ? composePromptPolicies(packSectionPolicies) : packSectionPolicies[0])
  const noticeBlock = (packRuntime.find((r) => r.noticeBlock) || {}).noticeBlock || null
  const extraPhases = packRuntime.length ? [...new Set(packRuntime.flatMap((r) => r.phases || []))] : null
  const promptPolicies = []   // the sink a pack's manifest.promptPolicies arrives through (vmu-pack's side)
  // ★ A1 STEP 1 · PART B: THE FEEDBACK STATE IS COMPUTED ONCE, OUTSIDE THE PROVIDER, AND BOTH HALVES OF THAT SENTENCE
  // MATTER. OUTSIDE, because the receipt is what CALLS the provider - a provider that read `report.status()` would
  // recurse forever, which is what happened when this was made lazy. ONCE, here, because the switch is read from the
  // resolved settings at this moment: a pack's VALUE layer is folded before the kernel (visible here), while its MANIFEST
  // is applied after (NOT visible) - and a pack's `vmu.report.*` keys must live on the manifest (one owner, O4). Measured:
  // value layer armed and delivered, manifest silently stayed off. Arming from a pack therefore needs the read to happen
  // later, which needs the face to hand its counts to the provider instead of the provider asking the face. Not done yet.
  let reportFeedbackState = null
  const kernel = createKernel(Object.assign({ sectionPolicy, noticeBlock, extraPhases, settings: settingsWithPackDefaults, root, spawn: spawnSeam, host: mathHost, deliverTurn: turnDeliver,
    reportFeedback: () => Object.assign({}, reportFeedbackState),
    // ROUND 6 / target-5 (reader-b's ruling): the SAME seam is the killable one - `spawn(request, onHandle)` hands the
    // host's handle to the caller BEFORE the outcome is awaited, which is what makes `cancel({jobId})` a real
    // `terminate()` instead of a named "this seam cannot kill".
    spawnHandle: spawnSeam,
    // ROUND 8 / task-58 (G6): THE ALLOCATING STORE, resolved AT CALL TIME (the same lesson as every other seam here:
    // a plugin's `apply` can run before the host service mounts). A store qualifies only if it can ALLOCATE a sequence
    // number - `append(record) -> { ticket }` plus `readAll()` - because that is what makes two processes sharing it
    // get distinct, monotonic tickets. Two sources, in order: the deployment's `config.commitStore`, then the host's
    // `ctx.get('store')`. Absent ⇒ the ballot reports `status().gate.durable === false` BY NAME (never pretended).
    commitStore: () => {
      const ok = (s) => !!(s && typeof s.append === 'function' && typeof s.readAll === 'function')
      if (ok(config.commitStore)) return config.commitStore
      try { const s = ctx && typeof ctx.get === 'function' ? ctx.get('store') : null; if (ok(s)) return s } catch { /* a ctx that cannot answer is reported as "no store" */ }
      return null
    },
    // ROUND 3 / task-20 F2: the MEMBER/MEETING/NOTIFY/REPORT delivery seam. The entry never injected one, so
    // `status().seams.deliver` was false and every report that had something to say left its trace but carried a named
    // refusal (`VMU_REPORT_NO_TRANSPORT`) - honest, but only half of "end-to-end automatic reporting".
    // BOUNDARY (chosen deliberately): the deployment supplies the transport as `config.deliver` (a function the host
    // owns: an inbox write, `subagents.sendMessage`, a webhook). We do NOT invent one from `ctx.get('subagents')` here,
    // because the report/member envelopes differ from a turn's `{turn,text}` and guessing a shape would be exactly the
    // "pretend it was delivered" failure the framework refuses. With no `config.deliver`, the seam stays absent and the
    // named refusal remains the honest answer.
    deliver: typeof config.deliver === 'function' ? config.deliver : null,
    // ROUND 4 / F9+F10: the two ongoing-command seams (see their assembly above). Both are always functions here, so
    // `status().seams.sendMessage/interrupt` reads true; the NAMED refusal happens when the host lacks the verb.
    sendMessage,
    interrupt,
    children,
    // ROUND 1 / K5 (D-02): the entry is the only layer that knows a folded pack default from a deployment value, so it
    // hands the layer map in. The named overlap report travels to the HOST face instead (`mergeReport` below), because
    // the kernel never acts on it and a kernel seam read by one file only is exactly what the seam gate forbids.
    settingsSources,
    // ROUND 1 / K5: ONE pack implementation. `kernel.usePack()` delegates to the same loader the pack tool drives.
    packApplier: (manifest) => packLoaderRef.apply(manifest),
    // a packs DATA-declared prompt text joins what the configuration supplies; the pipelines own `order` places it
    sections: [...packSections, ...promptSections], bindings: [...packBindings, ...promptBindings], overrides: promptOverrides, whoMayOverride, readFile: readRel },
  clock ? { clock } : {}))
  // DECLARATION IS THE CONFIGURATION. With nothing declared the preset must not even offer a settings
  // tool (the documented way to switch the first thing on is the profile's cordis.patch.yml), and the
  // middleware the configuration declares has to be ACTIVATED - that is what start() is for.
  const declared = Object.keys(settings).length > 0
  // INSTANCE IDENTITY: a profile can hold more than one vmu row (the preset's, plus a standalone one), and
  // the host keeps one registration per tool name - so without an identity the receipts look contradictory
  // (the live run showed `packs: []` from one instance and a pack rule from the other). `config.instance`
  // makes the answer unambiguous; the default is stable so tests stay deterministic.
  const instance = typeof config.instance === 'string' && config.instance.length > 0 ? config.instance : 'vmu-default'
  // The pack loader is created further down (it needs the kernel), so the adapter gets a LATE-BOUND getter:
  // the pack tool resolves it at call time, and no ordering trap is introduced (§11-§8 "TOCTOU" lessons).
  // It is offered ONLY when packs are actually declared - with no configuration the adapter must still
  // register exactly one tool (zero mechanism, R1); a management surface is not an exception to that.
  let packLoaderRef = null
  const packsDeclared = (Array.isArray(config.packs) && config.packs.length > 0) ||
    (Array.isArray(settings['vmu.packs.active']) && settings['vmu.packs.active'].length > 0)
  // ROUND 3 / task-20 F1 (framework defect, measured by vmu-assistant on a real host): the adapter was handed the
  // DEPLOYMENT's settings object, while a pack MANIFEST's settings (`packs/v5r/v5r-core.js` `PACK.settings`) are
  // applied AFTER the kernel exists - into the KERNEL's own settings. So a family key that only a pack manifest
  // declares was invisible to `resolveFaces()` and the face was never published (measured: pack-only load registered
  // only status/records/pack/middleware, while `report.status()` showed the pack policy really armed).
  // FIX AT THE ROOT: the adapter resolves intents from the KERNEL'S LIVE SETTINGS VIEW, so whatever
  // `kernel.applyPackSettings()` writes (pack manifests, runtime `vibe_vmu_set`) is visible to the NEXT install -
  // and the entry already re-installs after packs (see `await adapter.install()` below). No defaults.json workaround.
  // ROUND 25 / task-138: the pack install task and its in-flight flag. Declared HERE, above the adapter, because
  // the adapter's closure seams below (`packReport`, `mergeReport`) read them: an arrow that dereferences a `const`
  // declared later in the same scope would throw a TDZ ReferenceError if it were ever called early, and "it happens
  // to be called late today" is not a guarantee. `ready()` also waits on `packsInstall` (see the accessor list).
  let packsInstall = null
  let packsLoading = false
  const adapter = createHostAdapter(Object.assign({ ctx, kernel,
    // A caller may hand us a FAKE kernel (tests do): fall back to the deployment settings object when the real
    // `settingsView()` accessor is absent, so the live-resolution fix does not require a real kernel to exist.
    settings: typeof kernel.settingsView === 'function' ? kernel.settingsView() : settings,
    instance, scripts: Array.isArray(config.scripts) ? config.scripts : [],
    packLoader: packsDeclared ? () => packLoaderRef : null,
    // ROUND 25 / task-138: THE RECEIPT CARRIES THE PACK REPORT. The comment further down (`packErrors` / the
    // loading loop) has claimed since cfbd2c7 that "the status face now carries [the refusal] (see host.js)" while
    // `host.js` had ZERO references to it - a declaration with no implementation, which is the class this project
    // keeps catching. This is the missing half: `host.js` merges the returned object into the status receipt, so one
    // read answers all four questions - WHAT WAS REQUESTED, FROM WHERE, WHAT ACTUALLY APPLIED, WHY ANYTHING DID NOT.
    // Late-bound like `packLoader` above: only CALLED from the host face on a tool call, never during apply().
    packReport: () => ({
      requested: packRequested.map((p) => ({ id: p.id, via: p.via })),
      // ROUND 30 / task-151 (D1): `applied` carries BOTH ids per entry (never one merged set) plus the same-frame
      // `idMap`, so `applied[].manifestId ⊆ status().packs` is checkable by machine rather than by eye. The plain
      // name list stays available under `appliedPacks` (the manifest-id view) - no existing field changes meaning.
      applied: appliedIdMap.map((m) => ({ requestId: m.requestId, manifestId: m.manifestId })),
      appliedPacks: appliedPacks.map((a) => a.id),
      idMap: appliedIdMap.reduce((acc, m) => { if (m.requestId) acc[m.requestId] = m.manifestId; return acc }, {}),
      errors: packErrors.map((e) => ({ id: e.id, code: e.code, message: e.message })),
      loading: packsLoading,
      ok: packErrors.length === 0,
      // ROUND 26 / task-141: the KEYS a runtime-added pack could not fold. The host turns these into the FACES they
      // would have declared (`faces.notPublished`), which is what makes "this pack's tools are missing" legible
      // instead of an unexplained absence of ten tool names.
      defaultsUnfolded: defaultsUnfolded.map((u) => ({ id: u.id, keys: u.keys.slice(), reason: u.reason })),
    }),
    // ROUND 31 / task-153 (③): THE PROMPT-SECTION DEGRADATION, IN THE RECEIPT INSTEAD OF ONLY ON STDERR. Declaring
    // `vmu.prompts.*` text and failing to inject it is a real degradation: until now the ONLY place it existed was a
    // `process.stderr.write` line (further down), so a caller reading the receipt could not tell "the prompt was
    // injected" from "the prompt section was declared and silently not injected". Late-bound like `packReport`
    // above: only CALLED from the host face, never during apply().
    promptSection: () => Object.assign({}, promptSectionState),
    // ROUND 1 / K1 (D-01): `config` is handed over so `host.js` resolves WHICH faces are declared from the one map
    // (`resolveFaces`) instead of from four booleans assembled here. Every face now has a declaration path:
    // `config.<face>`, `config.faces`, `vmu.tools.faces`, or a `vmu.<family>.*` settings key.
    config,
    // ROUND 1 / K5 (D-02): ONE pack implementation. The adapter's pack face and `kernel.usePack()` both reach the
    // SAME loader (`kernel/pack.js`); without it `kernel.usePack()` refuses by name instead of applying through a
    // second, quietly-different path.
    packApplier: (manifest) => packLoaderRef.apply(manifest),
    // ROUND 1 / K5: the entry-side merge report, printed by `vibe_vmu_status` (the host face reads it, so the fact
    // travels to the model/operator instead of sitting in a seam nobody consumes).
    // ROUND 25 / task-138 (core2's finding): this used to report `wantedPackIds` - the DEPLOYMENT list only - so a
    // pack brought in by the settings switch (`vmu.packs.active`) left the receipt saying `packs: []` while its bus
    // entries were live. That is Round 23's defect mirrored (there: settings said installed while the kernel
    // refused; here: it really installed while the receipt said nothing). It now reports the EFFECTIVE request table
    // with each entry's SOURCE, and the failure half in the SAME object, so "requested / from where / really
    // applied / why not" are four facts in one read instead of two views the reader has to reconcile.
    mergeReport: () => ({
      priority: 'pack 默认 < preset Config／会话 settings < 运行时 set',
      packs: packRequested.map((p) => p.id),
      packSources: packRequested.map((p) => ({ id: p.id, via: p.via })),
      applied: packErrors.length === 0,
      appliedPacks: appliedPacks.map((a) => a.id),
      errors: packErrors.map((e) => ({ id: e.id, code: e.code, message: e.message })),
      loading: packsLoading,
      // ROUND 26 / task-141: WHICH defaults were folded, and which were NOT (with the key list, so a reader - or the
      // host - can name the faces those keys would have declared). `defaults: 0` above stays the folded KEY COUNT
      // (unchanged meaning); these two make the difference legible instead of leaving it looking like "no defaults".
      defaultsFolded: defaultsFoldedIds.slice(),
      defaultsUnfolded: defaultsUnfolded.map((u) => ({ id: u.id, keys: u.keys.slice(), reason: u.reason })),
      defaults: Object.keys(packDefaults).length,
      sources: Object.assign({}, settingsSources),
      conflicts: packMergeConflicts.map((c) => Object.assign({}, c)),
      shadowed: packDefaultShadowed.map((s) => Object.assign({}, s)),
    }) },
  declared ? { assertDeclared } : {}))
  const started = kernel.start().catch((e) => ({ ok: false, error: String(e && e.message) }))
  // The math surface is LAZY (kernel/math.js), so the shared module registers its tool only when asked. The
  // entry asks once, and a failure is reported by name instead of leaving the tool silently absent (R11).
  const mathReady = mathHost ? Promise.resolve().then(() => kernel.math()).then(
    (surface) => ({ ok: true, tool: surface && surface.registered ? surface.registered.name : null }),
    (e) => {
      const detail = { code: (e && e.code) || 'VMU_ENGINE_UNAVAILABLE', message: String((e && e.message) || e) }
      try { process.stderr.write('vmu: the math surface was not published: ' + detail.code + ' ' + detail.message + '\n') } catch { /* stderr may be gone */ }
      return { ok: false, ...detail }
    }) : Promise.resolve({ ok: true, skipped: 'no math host seam (vmu.math.computation is off, or the host has no tools.register)' })
  // With a durable root, OPEN the store: the durable layer must exist on disk, not merely be constructible.
  // (The library writes its own files; the store is the versioned state fold - docs/07 §1.)
  const opened = (root && kernel.store && typeof kernel.store.open === 'function')
    ? Promise.resolve(kernel.store.open()).catch((e) => ({ ok: false, error: String(e && e.message) }))
    : Promise.resolve({ ok: true, skipped: 'no durable root was configured' })
  // AFTER the store is open: whatever is still in the in-flight ledger was written by an earlier process and
  // did not settle, so it is marked INTERRUPTED and reported - the "after an interruption the owner is told
  // what is unfinished" promise (docs/07 §3) becomes real instead of a reserved key nobody writes.
  const workRecovered = opened.then(async () => {
    if (!kernel.work) return { ok: true, skipped: 'no durable root: there is no in-flight ledger' }
    try { return await kernel.work.recover() } catch (e) {
      const detail = { ok: false, code: (e && e.code) || 'VMU_STORE_FAILED', message: String((e && e.message) || e) }
      try { process.stderr.write('vmu: in-flight recovery failed: ' + detail.code + ' ' + detail.message + '\n') } catch { /* stderr may be gone */ }
      return detail
    }
  })
  // ROUND 2 (task-14, Lead's durable-projection item): THE STARTUP HYDRATION CHAIN, in the one order that is honest:
  //   ① the store is open (above) ② the ID COUNTERS are read back (`hydrateIds`) so the next mint continues past the
  //   durable counter ③ the RECOVERY FACE runs (`vmu.resume.autoRecover`, default true) so interrupted work, unacked
  //   mail and every declared projection are restored - or NAMED as unhydrated. Each step is a separate promise so a
  //   failure in one is reported without pretending the next one happened.
  const idsHydrated = opened.then(async () => {
    try { return await hydrateIds() } catch (e) {
      return { ok: false, code: (e && e.code) || 'VMU_IDS_UNAVAILABLE', message: String((e && e.message) || e) }
    }
  })
  const resumed = idsHydrated.then(async () => {
    const recovery = kernel.recovery
    if (!recovery || typeof recovery.recover !== 'function') return { ok: true, skipped: 'this assembly has no recovery face' }
    if (settings['vmu.resume.autoRecover'] === false) return { ok: true, skipped: 'vmu.resume.autoRecover = false (manual recover only)' }
    try { return await recovery.recover({ reason: 'kernel-start' }) } catch (e) {
      const detail = { ok: false, code: (e && e.code) || 'VMU_RESUME_UNAVAILABLE', message: String((e && e.message) || e) }
      try { process.stderr.write('vmu: recovery failed: ' + detail.code + ' ' + detail.message + '\n') } catch { /* stderr may be gone */ }
      return detail
    }
  })

  const effect = (fn, label) => {
    if (ctx && typeof ctx.effect === 'function') return ctx.effect(fn, label)
    return fn() // a context without effect() still works: the cleanup is returned to the caller
  }

  const cleanups = []
  // INERT MEANS INVISIBLE: when the kernel is switched off, not even an effect is registered.
  const switchedOff = settings['vmu.core.enabled'] === false
  let installError = null
  // The BRIDGE: the declared middleware must fire on REAL host events, not only on the internal bus.
  const hooks = attachHostHooks({ ctx, kernel, settings })
  let hooksResult = null
  let hooksError = null
  if (!switchedOff && hooks.plan().count > 0) {
    effect(() => {
      try {
        hooksResult = hooks.attach()
      } catch (e) {
        hooksError = { code: (e && e.code) || 'VMU_MIDDLEWARE_FAILED', message: String((e && e.message) || e), hint: (e && e.hint) || null }
        try { process.stderr.write('vmu: hook bridging failed: ' + hooksError.code + ' ' + hooksError.message + '\n') } catch { /* stderr may be gone */ }
      }
      return () => { try { hooks.detach() } catch { /* the host is going away anyway */ } }
    }, 'vmu:hooks')
  }
  // ROUND 2 (task-14, vmu-assistant's §5): THE PERIODIC-REPORT CLOCK. `kernel/report.js` has NO internal timer by
  // design ("a report never drives anything"), so the turn boundary is what advances it: the host's own
  // `agent/turn-stopping` event is bridged HERE (the entry owns its effects) rather than inside `host-hooks.js`
  // (which belongs to vmu-pack this round). A report must never break a turn, so a failure is swallowed - the
  // report face's own `status().reporting.failures` is where it is counted.
  // ROUND 3 / task-20 B: STRICT INERTNESS. The listener is attached ONLY when the report face is DECLARED (a
  // `vmu.report.*` key, `config.report`, `config.faces`, or the universal `vmu.tools.faces` list naming it).
  // "the kernel is enabled" is NOT a declaration: an undeclared face must not even install a host listener (the
  // zero-mechanism red line), and with no declaration `report.tick()` would be a no-op anyway - so attaching it was
  // invisible work with no effect, which is exactly the shape the red line forbids.
  // F5 (Lead, measured on a real host): the SAME root cause as F1. `reportDeclared` was computed HERE (construction
  // time), while a PACK MANIFEST's settings are applied at load time - so a pack-only deployment published
  // `vibe_vmu_report` (F1 fixed the face resolution) but NEVER attached this listener, and the pack's own periodic
  // reports could only be driven by the manual `action:'tick'`.
  // FIX: the gate is evaluated AT INSTALL TIME and keyed on the F1 truth - the report face is PUBLISHED (the adapter's
  // own registration list) - and it is re-evaluated after every install (the entry re-installs after packs/modules).
  // The semantics are unchanged: NO declaration ⇒ the face is not published ⇒ no listener (zero-mechanism red line).
  let reportTickAttached = false
  const attachReportTick = () => {
    if (switchedOff || reportTickAttached || !kernel.report) return
    const published = typeof adapter.status === 'function' ? (adapter.status().registered || []) : []
    if (!published.includes('vibe_vmu_report')) return   // F1's own answer: not declared ⇒ not published
    reportTickAttached = true
    effect(() => {
      if (!ctx || typeof ctx.on !== 'function') { reportTickAttached = false; return () => {} }
      // ROUND 19 / task-121 — THE BOUNDARY NOW CARRIES REAL METRICS. Until this change the listener called
      // `tick({ at, event:'turn-end' })` with no `metrics`, and `kernel/report.js`'s `thresholdMet()` answers
      // `false` for a missing object BY DESIGN ("no data" must never become a fire) — so `event`/`period` reports
      // fired autonomously while a `threshold` report could only fire when somebody hand-fed it numbers.
      // The fix belongs on THIS side: the framework reads what it really counted (`kernel.metricValues()`, built
      // from the `vmu.metrics` face) and hands it over. `thresholdMet()` is UNCHANGED, so an indicator with no
      // observation is simply absent from the map and that report stays silent. The catch stays: a report must
      // never be able to break the turn that produced it.
      const listener = async () => {
        try {
          const metricsOf = kernel && typeof kernel.metricValues === 'function' ? kernel.metricValues() : null
          kernel.report.tick({ at: Date.now(), event: 'turn-end', metrics: metricsOf })
        } catch { /* never break the turn */ }
      }
      const dispose = typeof ctx.effect === 'function' ? ctx.effect(() => ctx.on('agent/turn-stopping', listener), 'vmu:report-tick') : ctx.on('agent/turn-stopping', listener)
      return typeof dispose === 'function' ? dispose : () => {}
    }, 'vmu:report-tick')
  }
  if (!switchedOff) {
    effect(() => {
      const installing = adapter.install()
      const cleanup = () => {
        // ROUND 9 / task-66 B — THE EXIT FLUSH ON THE DISPOSE PATH. `adapter.uninstall()` performs it (it awaits
        // `kernel.shutdown()`, which waits for the in-flight state writes and then flushes the journals - the two
        // different promises in docs/03 §2). The PROMISE IS RETURNED so a host that awaits its disposers actually
        // waits for the flush; a host that does not still runs it, and `status().shutdown` records what happened
        // either way (so "did the journals get flushed" is answerable after the fact, not assumed).
        let pending = null
        try { pending = adapter.uninstall() } catch (e) {
          const detail = 'vmu: exit flush threw during uninstall: ' + String((e && e.message) || e)
          try { process.stderr.write(detail + '\n') } catch { /* stderr may be gone */ }
          return null
        }
        if (!pending || typeof pending.then !== 'function') return pending
        return pending.then((r) => {
          if (r && r.exitFlush && r.exitFlush.ok !== true) {
            const detail = 'vmu: exit flush FAILED: ' + (r.exitFlush.code || 'unknown') + ' ' + JSON.stringify(r.exitFlush.failed || [])
            try { process.stderr.write(detail + '\n') } catch { /* stderr may be gone */ }
            try { if (ctx && ctx.logger && typeof ctx.logger.warn === 'function') ctx.logger.warn(detail) } catch { /* logging never breaks the teardown */ }
          }
          return r
        })
      }
      cleanups.push(cleanup)
      // F5: the report clock is attached AFTER the tools are registered, because its gate IS the registration list
      // (`vibe_vmu_report` published ⇔ the face is declared). This is the initial install; the entry re-installs after
      // packs/modules and calls `attachReportTick()` again there (idempotent).
      installing.then(() => attachReportTick(), () => {})
      // A registration that fails must SAY SO (R11: a silent failure is worse than a named one). The first
      // scripted live run found this the hard way: the tools never appeared and nothing was logged.
      installing.catch((e) => {
        installError = { code: (e && e.code) || 'VMU_MIDDLEWARE_FAILED', message: String((e && e.message) || e), hint: (e && e.hint) || null }
        try { process.stderr.write('vmu: tool registration failed: ' + installError.code + ' ' + installError.message + '\n') } catch { /* stderr may be gone */ }
      })
      return cleanup
    }, 'vmu:tools')
  }

  // The host section carries the EFFECTIVE text of every declared/overridden section (joined into the one
  // section name the host already accepts). No declaration ⇒ no effect at all (zero mechanism, R1).
  //
  // ROUND 21 / task-129 — **H2, CONFIRMED LOCALLY, AND IT WAS OUR LINE**: reading `ctx.systemPrompt` IS the
  // defect when that service was never injected. cordis answers an un-injected service access with a THROWING
  // getter (`cannot get property "systemPrompt" without inject`), so the `ctx &&` truthiness check could not
  // guard it — and a PACK's prompt data (`:230-243` pushes into `effectivePrompts`) is exactly what makes this
  // branch execute. ⇒ THE DOCUMENTED PACK LOADING POINT (`config.packs`) was what first ran this line and killed
  // preset assembly with `agent-preset/invalid`. Reproduced with no DSH at all by `D:\_tmp\r21b-h2-probe.mjs`
  // (a ctx whose `systemPrompt` is an access-counting throwing getter): `packs: []` touches it 0 times;
  // `packs: ['v5r']` touches it once and throws exactly that message.
  //
  // THE GUARD IS NOT A SWALLOW: the host is TOLD by name (stderr with the stack, and `status().promptSection`),
  // and the section is simply not registered when it cannot be. `inject` is deliberately NOT extended with
  // `systemPrompt`: that would make this plugin REQUIRE a service a minimal host need not have, which is the
  // opposite of the zero-mechanism default.
  let promptSectionState = { registered: false, code: null, reason: null }
  if (effectivePrompts.length > 0) {
    let systemPrompt = null
    try {
      // ★ TWO HOST FORMS, BOTH SUPPORTED - trying only one is a measured bug: `ctx.get` reads WITHOUT the inject
      // requirement this plugin deliberately lacks (so the property access THROWS), but a host may expose the service as
      // a plain property and implement no `get` - reading only through `get` silently killed this channel there (0 sections).
      if (ctx && typeof ctx.get === 'function') systemPrompt = ctx.get('systemPrompt')
      if (!systemPrompt) systemPrompt = ctx && ctx.systemPrompt ? ctx.systemPrompt : null
    } catch (e) {
      promptSectionState = { registered: false, code: 'VMU_EXTERNAL_UNAVAILABLE', what: 'systemPrompt',
        reason: String((e && e.message) || e), stack: String((e && e.stack) || '') }
      try { process.stderr.write('vmu: prompt text is declared but the host systemPrompt service is NOT reachable (not injected?): ' + promptSectionState.reason + '\n' + (promptSectionState.stack || '') + '\n') } catch { /* stderr may be gone */ }
    }
    if (!promptSectionState.code && systemPrompt && typeof systemPrompt.section === 'function') {
      // ROUND 21 / task-129 (ARM A) — **THE CALL NEEDS THE SAME PROTECTION AS THE ACCESS.** A host that exposes
      // the service but throws when it is USED (`section()` refusing an un-injected caller) escaped `apply()`
      // entirely, and the catch above wrote NOTHING: the live arm-A signature is exactly "`session/create` rejected
      // (exit 1), host stderr **0 B**", while arm D (`packs:['no-such-pack']`: our loader runs and fails BY NAME)
      // starts fine — i.e. the crash requires a pack that loads SUCCESSFULLY and therefore reaches THIS branch.
      // Guarded here, such a host degrades BY NAME (stderr with the stack + `status().promptSection`) instead of
      // killing the preset assembly. NOT optional chaining (it triggers the getter too), NOT an `inject` addition,
      // NOT a silenced error — and no new code: the registered `VMU_EXTERNAL_UNAVAILABLE` is reused with `what`.
      try {
        effect(() => {
          const order = typeof systemPrompt.getSectionOrder === 'function'
            ? systemPrompt.getSectionOrder('TEAM_POLICY') : undefined
          const text = effectivePrompts.map((s) => s.text).join('\n\n')
          const dispose = systemPrompt.section({ name: 'vmu', order, text })
          return typeof dispose === 'function' ? dispose : () => {}
        }, 'vmu:prompt')
        promptSectionState = { registered: true, code: null, reason: null }
      } catch (e) {
        promptSectionState = { registered: false, code: 'VMU_EXTERNAL_UNAVAILABLE', what: 'systemPrompt.section',
          reason: String((e && e.message) || e), stack: String((e && e.stack) || '') }
        try { process.stderr.write('vmu: the host systemPrompt service refused this section (not injected?): ' + promptSectionState.reason + '\n' + (promptSectionState.stack || '') + '\n') } catch { /* stderr may be gone */ }
      }
    } else if (!promptSectionState.code) {   // ★ THREE STATES, NAMED DISTINCTLY (phase-3 audit #1; the delivery module carries the same split): nothing was OBTAINED ⇒ `systemPrompt` (never blame an interface the host may not have); obtained but no method ⇒ `systemPrompt.section`; a read that THREW is the catch above, with its stack
      promptSectionState = { registered: false, code: 'VMU_EXTERNAL_UNAVAILABLE', what: systemPrompt === null || systemPrompt === undefined ? 'systemPrompt' : 'systemPrompt.section',
        reason: systemPrompt === null || systemPrompt === undefined ? 'no host systemPrompt service was obtained: either none is provided, or one is provided but its providing fiber is not currently active (ctx.get cannot distinguish these)' : 'the host provided a systemPrompt service that carries no .section() to receive ' + effectivePrompts.length + ' declared section(s)' }
    }
  }

  // ★ A1 STEP 1 · PART B: the delivery call, made ONCE FROM OUTSIDE THE PROVIDER. It must be outside: the receipt is what
  // CALLS the provider, so a provider that read `report.status()` to compute itself would recurse forever. Everything the
  // call needs - the four outcomes, the named failures, why the payload is a runtime snapshot - lives in
  // `kernel/reportfeedbackdelivery.js`.
  reportFeedbackState = deliverReportFeedbackFrom({ kernel, ctx, effect })

  // A PACK is where an institution lives (slots, tracks, rules, aliases). `config.packs` accepts either a
  // shipped pack id (resolved from packs/<id>.js) or an inline manifest; conflicts are refused (O4) and the
  // failure is visible instead of swallowed.
  // ROUND 20 (task-125): the inline half of that sentence WAS FALSE - an object entry reached the data-only probe
  // and threw `ERR_INVALID_ARG_TYPE The "path" argument must be of type string` before `apply()` was ever called,
  // so a deployment could not ship a pack inline at all (and with it, no M2 policy that needs `api.services`).
  // The branch below now takes the object straight to `apply()`; `tests/vmu-pack-inline-manifest.test.mjs` holds
  // the two directions (a good inline manifest really loads; a bad one is refused BY NAME, not by a TypeError).
  // ROUND 1 / K5 (D-02, vmu-pack interface): `settingSource` lets the loader tell "this key belongs to a HIGHER
  // layer ⇒ my default is shadowed" from "it belongs to ANOTHER pack ⇒ named conflict"; `onPromptPolicy` is the sink
  // for a manifest's own `promptPolicies`, which is what makes a pack's prompt machinery pack-owned instead of
  // hard-wired here. Both are optional to the loader, so this call is safe before vmu-pack's side lands.
  const packLoader = createPackLoader({ kernel, registry: kernel.registry,
    settingSource: (key) => kernel.settingSource(key),
    onPromptPolicy: (p) => { promptPolicies.push(p) } })
  packLoaderRef = packLoader
  // ROUND 24 / task-136 — `vmu.packs.active` IS A REAL SWITCH NOW, ON THIS SAME LOADING PATH.
  // It used to only flip `packsDeclared` (:515-516) and therefore only made the pack TOOL/loader REACHABLE
  // (:530) while loading nothing: a settings key advertising "which packs I declared" that loaded no pack is the
  // "declared but ineffective" class — and the SETTINGS face is the TUNABILITY face (hot, per-deployment) whereas
  // `config.packs` is a deployment-time constant that requires editing the profile row.
  // DECISION (named; NO second semantics — the loading loop below is byte-identical):
  //   · the loading list is `config.packs` FIRST (deployment baseline: it keeps its order and keeps owning the
  //     PACK_RUNTIME fold at :452), then every settings-only id in `vmu.packs.active`, deduped;
  //   · ⇒ settings can ADD a pack without touching the profile row (the whole point of the switch), and they
  //     CANNOT remove a deployment pack (dropping one is a deployment decision, made in the overlay);
  //   · a pack declared by BOTH loads ONCE and its source stays `config.packs`;
  //   · where each request came from is recorded per id (`packSourceOf` ⇒ `packRequested`) so a receipt can tell
  //     the two sources apart instead of guessing.
  // THE DURABLE-ROOT REQUIREMENT IS NOT RELAXED for either source: both go through the same `packLoader.apply`,
  // so a missing `config.root` refuses BY NAME (`VMU_ENGINE_UNAVAILABLE this kernel has no library root`) and the
  // refusal lands in `packErrors` — which the status face now carries (see host.js) instead of leaving the caller
  // with one stderr line while `settingsMerge.packs` still advertises the pack.
  const deploymentPacks = Array.isArray(config.packs) ? config.packs : []
  const activeFromSettings = Array.isArray(settings['vmu.packs.active']) ? settings['vmu.packs.active'].filter((p) => typeof p === 'string') : []
  const packSourceOf = new Map()
  for (const w of deploymentPacks) packSourceOf.set(typeof w === 'string' ? 'id:' + w : w, 'config.packs')
  const packsWanted = deploymentPacks.slice()
  for (const w of activeFromSettings) {
    const key = 'id:' + w
    if (packSourceOf.has(key)) continue          // declared by BOTH ⇒ one load, source stays `config.packs`
    packSourceOf.set(key, 'vmu.packs.active')
    packsWanted.push(w)                          // SAME shape a `config.packs` entry has ⇒ the loop needs no change
  }
  const packRequested = packsWanted.map((w) => ({ id: typeof w === 'string' ? w : (w && w.id) || null, via: packSourceOf.get(typeof w === 'string' ? 'id:' + w : w) || null }))
  const appliedPacks = []
  const packErrors = []
  // ROUND 30 / task-151 (D1): THE TWO ID SETS, MAPPED EXPLICITLY. A pack is REQUESTED by id (`v5r`) and APPLIES
  // under the id its manifest declares (`v5r-core`): the loader's receipt carries the manifest id, while the request
  // id is what the deployment wrote. Merging the two would silently change both fields' meaning, and leaving the
  // correspondence implicit made the cross-check (`applied ⊆ status().packs`) hold only by eye and only in the same
  // frame. This records the mapping where the manifest id first becomes known, so the check is machine-checkable.
  const appliedIdMap = []
  if (!switchedOff && packsWanted.length > 0) {
    effect(() => {
      packsLoading = true
      // ROUND 25 / task-138: the task is CAPTURED (not just started) so `ready()` can wait for it, and it is made
      // non-rejecting on purpose: a caller awaiting `ready()` must not get a rejection because ONE pack refused -
      // the refusal belongs in `packErrors` (a receipt), not in the readiness promise. `finally` guarantees the
      // in-flight flag clears even on a throw, so `packsLoading` can never be stuck true.
      const run = (async () => {
        for (const wanted of packsWanted) {
          try {
            // GOAL 2: a pack may be a FOLDER - settings/ plus middleware/ plus an index.js manifest - or the older flat

            // module. The folder is tried first, and ONLY a module-not-found falls back: a real error inside the folder's

            // index must not be mistaken for "no folder", or a broken pack would silently load the flat one instead.

            let loaded = null

            let inlineManifest = null

            if (typeof wanted === 'string') {

              try {

                loaded = await import('./packs/' + wanted + '/index.js')

              } catch (e) {

                const missing = e && (e.code === 'ERR_MODULE_NOT_FOUND' || e.code === 'MODULE_NOT_FOUND')

                if (!missing) throw e

                // A PACK THAT ONLY CARRIES DATA HAS NO MANIFEST AT ALL, and that is not a failure. The flat file is
                // kept as a compatibility fallback for packs written before the folder shape, so BOTH misses together
                // mean "this name carries no manifest" - which the branch below decides on, by looking for data.
                try {

                  loaded = await import('./packs/' + wanted + '.js')

                } catch (e2) {

                  const missing2 = e2 && (e2.code === 'ERR_MODULE_NOT_FOUND' || e2.code === 'MODULE_NOT_FOUND')

                  if (!missing2) throw e2

                  loaded = null

                }

              }

            } else if (wanted && typeof wanted === 'object' && !Array.isArray(wanted)) {

              // AN INLINE MANIFEST - the other half of what the comment above has always claimed. This case used to
              // fall straight into the data-only probe below, which computes `join(dir, 'packs', wanted, rel)` with
              // the OBJECT as a path segment and threw `ERR_INVALID_ARG_TYPE The "path" argument must be of type
              // string. Received an instance of Object` (round 20, task-125). The declaration was true of the intent
              // and false of the runtime, and because an M2 module reaches `api.services` ONLY through a pack
              // manifest (kernel/pack.js: two shapes, only the module one gets `api`), the whole
              // "deployment-side inline pack that has to ACT" path was unusable. Here there is no folder to look in
              // and no file to import: the manifest IS the pack, and `apply()` below validates it and refuses a bad
              // one BY NAME (VMU_PACK_MISSING + the problem list + a hint), never with a raw TypeError.
              inlineManifest = wanted

            } else {

              throw packModule.refuse('VMU_PACK_INVALID',
                'config.packs entries must be a pack id (string) or an inline manifest (object): got '
                  + (wanted === null ? 'null' : Array.isArray(wanted) ? 'array' : typeof wanted),
                'pass a shipped id such as "v5r", or the manifest object itself (docs/10 section 2)')

            }

            // A DATA-ONLY PACK IS ACTIVATED, NOT REFUSED. It has no manifest because it has no machinery: the plugin
            // already read its prompts/sections.json (and settings/defaults.json) by folder name before the kernel was
            // constructed, and those are the whole of what it contributes. Reporting it as "not applied" would tell a
            // deployment that turning on a text-only pack FAILED, while the text was in fact already in the pipeline -
            // so this branch records it as applied with nothing to apply, and only a name with neither a manifest NOR
            // data reaches the error path below. An INLINE manifest is never probed for folder data: it has no folder.
            if (loaded === null && inlineManifest === null) {
              const here2 = dirname(fileURLToPath(import.meta.url))
              // A GUARD MUST NOT SWALLOW ITS OWN BUG. The first version of this line wrapped `existsSync` in a try/catch
              // to tolerate a missing packs folder - and when `existsSync` was not imported at all, the ReferenceError
              // was caught and reported as "carries nothing", so the pack was refused and the reason was invisible.
              // A missing folder returns false on its own; the only thing this try/catch could ever hide was a mistake
              // in the check itself, which is exactly the class of failure this branch exists to prevent.
              const carries = (rel) => existsSync(join(here2, 'packs', wanted, rel))
              const promptData = carries(join('prompts', 'sections.json'))
              const defaultsData = carries(join('settings', 'defaults.json'))
              if (promptData || defaultsData) {
                appliedPacks.push({ id: wanted, applied: [], dataOnly: true, carries: { promptSections: promptData, settingsDefaults: defaultsData } })
                continue
              }
              throw new Error('no pack named ' + wanted + ': neither a manifest (packs/' + wanted + '/index.js or packs/' + wanted + '.js) nor data (prompts/sections.json, settings/defaults.json)')
            }

            const manifest = inlineManifest !== null ? inlineManifest : loaded.PACK
            const res = await packLoader.apply(manifest)
    // ROUND 383 - THE LAST MILE. A pack is loaded AFTER the kernel, because a pack's apply may need it, but the
    // prompt pipeline is built from `config.promptSections` at kernel construction. So a pack that DECLARES sections
    // - which is how this pack brings the charter transcribed from the original source - used to be visible to the
    // tests and invisible to a real round. The pipeline supports late section registration, and a binding channel was
    // added for the same reason: without bindings a late charter would assemble with a baseline written for another
    // role. Failures are NOT swallowed: a declared section the pipeline refuses is a configuration error worth seeing.
    if (manifest && kernel.prompt) {
      const declared = Array.isArray(manifest.sections) ? manifest.sections : []
      for (const s of declared) kernel.prompt.register(s)
      const declaredBindings = Array.isArray(manifest.bindings) ? manifest.bindings : []
      if (declaredBindings.length) {
        if (typeof kernel.prompt.bind !== 'function') {
          throw new Error('this kernel prompt face cannot accept bindings, so a pack that declares them would assemble with a wrong baseline')
        }
        for (const b of declaredBindings) kernel.prompt.bind(b)
      }
    }
            appliedPacks.push({ id: res.id, applied: res.applied })
            // D1: record the correspondence AT THE POINT IT BECOMES KNOWABLE (request -> manifest id). `wanted` is
            // what the deployment/switch wrote; `res.id` is the manifest's own id.
            appliedIdMap.push({ requestId: typeof wanted === 'string' ? wanted : (wanted && wanted.id) || null, manifestId: res.id })
          } catch (e) {
            const id = typeof wanted === 'string' ? wanted : (wanted && wanted.id)
            packErrors.push({ id, code: (e && e.code) || 'VMU_PACK_MISSING', message: String((e && e.message) || e) })
            try { process.stderr.write('vmu: pack ' + id + ' was not applied: ' + ((e && e.code) || '') + ' ' + String((e && e.message) || e) + '\n') } catch { /* stderr may be gone */ }
          }
        }
        // AFTER the packs settle: a pack can make tools available that did not exist at install time (bus
        // entries, a roster, a durable root). install() is serialised and idempotent.
        try { await adapter.install() } catch (e) {
          packErrors.push({ id: '(reinstall)', code: (e && e.code) || 'VMU_MIDDLEWARE_FAILED', message: String((e && e.message) || e) })
        }
        // F5: a pack manifest may have just declared `vmu.report.*`, which is what publishes `vibe_vmu_report` - so the
        // report clock is (re)considered HERE, where the F1 fix made the face visible.
        attachReportTick()
        // ...and a pack can add BUS ENTRIES, whose hooks must now be bridged too (a rule that exists but is
        // not bridged is a rule that silently never fires).
        try { hooks.refresh() } catch (e) {
          packErrors.push({ id: '(hooks)', code: (e && e.code) || 'VMU_MIDDLEWARE_FAILED', message: String((e && e.message) || e) })
        }
      })()
      // ROUND 25 / task-138: `ready()` used to resolve WITHOUT waiting for this task, so a caller could read
      // `packErrors` as empty simply because the loading had not settled - and a test written against that timing
      // measures its own race (core2 hit exactly that: its C arm saw an empty `packErrors` on its first run). The
      // promise is now both awaited by `ready()` and published as `packsLoading`, so a caller that does NOT await
      // can still see the truth instead of sleeping.
      packsInstall = run
        .catch((e) => { packErrors.push({ id: '(packs)', code: (e && e.code) || 'VMU_MIDDLEWARE_FAILED', message: String((e && e.message) || e) }) })
        .finally(() => { packsLoading = false })
      void packsInstall
      return () => {
        for (const a of appliedPacks.slice()) { try { packLoader.unload(a.id) } catch { /* going away */ } }
      }
    }, 'vmu:packs')
  }

  // M2 CODE MODULES: `config.modules` accepts an inline module object or `{ id, file }` (a path, imported
  // dynamically). They go through the same loader as everything else - mandatory meta/capabilities/registered
  // hooks - and land on the same bus, so ordering, capabilities, failure policies and traces are shared.
  const modulesWanted = Array.isArray(config.modules) ? config.modules : []
  const loadedModules = []
  const moduleErrors = []
  const moduleEntryIds = []
  if (!switchedOff && modulesWanted.length > 0) {
    effect(() => {
      const run = (async () => {
        const specs = []
        for (const m of modulesWanted) {
          // The loader insists on `kind: 'module'` (its own guard): an entry without it is refused with a
          // named error, which is how this wiring mistake was found.
          if (typeof m === 'string') specs.push({ kind: 'module', id: basename(m, '.js'), file: m })
          else if (m && m.module) specs.push(Object.assign({ kind: 'module' }, m))
          else if (m && m.file) specs.push({ kind: 'module', id: m.id || basename(m.file, '.js'), file: m.file, capabilities: m.capabilities })
          else specs.push(Object.assign({ kind: 'module' }, m))
        }
        try {
          const busEntries = await kernel.loader.toBusEntries(specs, {
            importModule: (file) => import(pathToFileURL(file).href),
          })
          for (const e of busEntries) { kernel.bus.add(e); moduleEntryIds.push(e.id) }
          for (const s of specs) loadedModules.push(s.id)
          // A module can make tools available too (a bus with entries), so reinstall - it is serialised -
          // and re-bridge, because the module's hooks must fire on the host.
          try { await adapter.install() } catch (e) {
            moduleErrors.push({ id: '(reinstall)', code: (e && e.code) || 'VMU_MIDDLEWARE_FAILED', message: String((e && e.message) || e) })
          }
          attachReportTick()   // F5: a loaded module may have declared `vmu.report.*` too.
          try { hooks.refresh() } catch (e) {
            moduleErrors.push({ id: '(hooks)', code: (e && e.code) || 'VMU_MIDDLEWARE_FAILED', message: String((e && e.message) || e) })
          }
        } catch (e) {
          moduleErrors.push({ id: '(load)', code: (e && e.code) || 'VMU_MIDDLEWARE_FAILED', message: String((e && e.message) || e) })
          try { process.stderr.write('vmu: a code module was not loaded: ' + ((e && e.code) || '') + ' ' + String((e && e.message) || e) + '\n') } catch { /* stderr may be gone */ }
        }
      })()
      void run
      return () => {
        for (const id of moduleEntryIds.splice(0)) { try { kernel.bus.disable(id, 'vmu modules unloaded') } catch { /* going away */ } }
      }
    }, 'vmu:modules')
  }

  return {
    kernel,
    adapter,
    instance,
    mathHost: () => mathHost,
    mathReady: () => mathReady,
    workRecovered: () => workRecovered,
    // ROUND 2 (task-14): the two startup steps after the store opens - the id counters read back, then the recovery
    // face. Both are promises a caller (or a test) can await; `ready()` waits for them too, so "the session is up"
    // never means "the durable state was not restored yet".
    idsHydrated: () => idsHydrated,
    resumed: () => resumed,
    // The entry's own prompt view: WHICH declaration produced each section's effective text (inline / file /
    // override). The kernel pipeline reports the declaring LAYER plus an `overridden` flag, which is a
    // different (and complementary) question - docs/06 §7 states both so the two are never conflated.
    prompts: () => effectivePrompts.map((s) => ({ name: s.name, order: s.order, source: s.source, chars: s.text.length })),
    loadedModules: () => loadedModules.slice(),
    moduleErrors: () => moduleErrors.slice(),
    packLoader: () => packLoader,
    appliedPacks: () => appliedPacks.slice(),
    packErrors: () => packErrors.slice(),
    // ROUND 25 / task-138: the same four facts the host receipt carries (`packReport`), readable by a caller that
    // does NOT await `ready()` - plus the in-flight flag, so "empty because nothing refused" is distinguishable
    // from "empty because nothing has run yet" without a sleep.
    packsLoading: () => packsLoading,
    packReport: () => ({
      requested: packRequested.map((p) => ({ id: p.id, via: p.via })),
      // ROUND 30 / task-151 (D1): `applied` carries BOTH ids per entry (never one merged set) plus the same-frame
      // `idMap`, so `applied[].manifestId ⊆ status().packs` is checkable by machine rather than by eye. The plain
      // name list stays available under `appliedPacks` (the manifest-id view) - no existing field changes meaning.
      applied: appliedIdMap.map((m) => ({ requestId: m.requestId, manifestId: m.manifestId })),
      appliedPacks: appliedPacks.map((a) => a.id),
      idMap: appliedIdMap.reduce((acc, m) => { if (m.requestId) acc[m.requestId] = m.manifestId; return acc }, {}),
      errors: packErrors.map((e) => ({ id: e.id, code: e.code, message: e.message })),
      loading: packsLoading,
      ok: packErrors.length === 0,
      // ROUND 26 / task-141: the KEYS a runtime-added pack could not fold. The host turns these into the FACES they
      // would have declared (`faces.notPublished`), which is what makes "this pack's tools are missing" legible
      // instead of an unexplained absence of ten tool names.
      defaultsUnfolded: defaultsUnfolded.map((u) => ({ id: u.id, keys: u.keys.slice(), reason: u.reason })),
    }),
    // ROUND 31 / task-153 (③): THE PROMPT-SECTION DEGRADATION, IN THE RECEIPT INSTEAD OF ONLY ON STDERR. Declaring
    // `vmu.prompts.*` text and failing to inject it is a real degradation: until now the ONLY place it existed was a
    // `process.stderr.write` line (further down), so a caller reading the receipt could not tell "the prompt was
    // injected" from "the prompt section was declared and silently not injected". Late-bound like `packReport`
    // above: only CALLED from the host face, never during apply().
    promptSection: () => Object.assign({}, promptSectionState),
    // ROUND 1 / K5 (D-02): the entry-side merge, in full - the priority ladder, the per-key layer, the named
    // conflicts and the overrides a deployment asked for. `vibe_vmu_status` reads the kernel's `settingsMerge`, which
    // carries the same two arrays; this accessor is for tests and for a host that wants the fact before kernel build.
    packMerge: () => ({
      priority: 'pack 默认 < preset Config／会话 settings < 运行时 set',
      // ROUND 25 / task-138: the THIRD view of the same fact. It used to report `wantedPackIds` (deployment only)
      // like `mergeReport` did - fixing one and leaving the other would have created a fresh pair of views that
      // disagree, which is the defect being fixed. Both now report the effective request table and its sources.
      packs: packRequested.map((p) => p.id),
      packSources: packRequested.map((p) => ({ id: p.id, via: p.via })),
      appliedPacks: appliedPacks.map((a) => a.id),
      errors: packErrors.map((e) => ({ id: e.id, code: e.code, message: e.message })),
      loading: packsLoading,
      defaults: Object.keys(packDefaults).length,
      sources: Object.assign({}, settingsSources),
      conflicts: packMergeConflicts.map((c) => Object.assign({}, c)),
      shadowed: packDefaultShadowed.map((s) => Object.assign({}, s)),
      promptPolicies: promptPolicies.slice(),
    }),
    promptPolicies: () => promptPolicies.slice(),
    hooks,
    hooksResult: () => hooksResult,
    hooksError: () => hooksError,
    /** Resolves once the tools are registered, the declared middleware is activated AND THE PACK INSTALL HAS
     *  SETTLED. ROUND 25 / task-138: the last clause is new - see the `packsInstall` capture in the loading block.
     *  `packsInstall` is null when the pack path is switched off, and `Promise.all` accepts that (it resolves). */
    ready: () => Promise.all([started, opened, Promise.resolve(adapter.status()), idsHydrated, resumed, packsInstall]).then(([, , st]) => st),
    started: () => started,
    storeOpened: () => opened,
    // ROUND 21 / task-129 (H2): whether the declared prompt text reached the host — and, when it did not, the
    // NAMED reason (this is what used to kill preset assembly instead of being readable).
    promptSection: () => Object.assign({}, promptSectionState),
    status: () => Object.assign(adapter.status(), { installError, promptSection: Object.assign({}, promptSectionState), settingsUnparsed: settingsUnparsed.slice(), settingsConflicts: settingsConflicts.slice(), packsLoading }),
    installError: () => installError,
    /** Round 6 B: what the entry could NOT turn into a setting, and what was declared in both shapes. */
    settingsUnparsed: () => settingsUnparsed.slice(),
    settingsConflicts: () => settingsConflicts.slice(),
    settings: () => Object.assign({}, settings),
    cleanups,
  }
}



