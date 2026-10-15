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
import { createKernel } from './kernel/index.js'
import { deliverViaSubagents, sendViaSubagents, interruptViaSubagents } from './kernel/turn/index.js'
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
      } catch (e) {
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
  const turnDeliver = async ({ turn, text } = {}) => {
    let subs = null
    try { subs = ctx && typeof ctx.get === 'function' ? ctx.get('subagents') : null } catch { subs = null }
    if (!subs || typeof subs.startContinuable !== 'function') {
      const err = new Error('the host exposes no subagents service (ctx.get(\'subagents\')), so no member turn can be delivered')
      err.code = 'VMU_ENGINE_UNAVAILABLE'
      err.hint = 'the turn loop refuses by name rather than pretending a member answered (docs/26 stage 3); pass config.deliverReply to extract the reply from a non-standard handle'
      throw err
    }
    const extract = typeof config.deliverReply === 'function' ? config.deliverReply : null
    return deliverViaSubagents(subs, extract)({ turn, text })
  }
  // ROUND 4 / F9+F10 (docs/26 §3.22): THE ONGOING-COMMAND SEAMS, assembled exactly like the turn-delivery one above -
  // the capability is the host's (`subagents.sendMessage` / `subagents.interrupt`), the bridge is
  // `kernel/turn/index.js`'s, and the service is resolved AT CALL TIME (a plugin's `apply` can run before the
  // subagents service mounts, and binding "absent" now would refuse every command forever). A host without the verb
  // produces the bridge's NAMED refusal; the kernel reports the seam as absent in `status().seams.sendMessage/interrupt`.
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
  // ROUND 4 / task-25 (reader-a's 5②): the recovery CHILDREN port. The host's `listChildren(parentSessionId)` is its own
  // durable direct-child directory (it does NOT load or resume an Agent), which is exactly what "reconcile the members
  // that hold a childId against reality after a restart" needs. A host without it yields the NAMED
  // `VMU_RESUME_CHILDREN_UNAVAILABLE`; recovery still succeeds - it just says the roster could not be checked.
  const children = {
    parentId: () => {
      try {
        if (ctx && typeof ctx.sessionId === 'string' && ctx.sessionId) return ctx.sessionId
        if (ctx && typeof ctx.get === 'function') { const s = ctx.get('session'); if (s && typeof s.id === 'string' && s.id) return s.id }
      } catch { /* a ctx that cannot answer is reported as "no parent id" */ }
      return null
    },
    list: async (parentId) => {
      const subs = resolveSubagents()
      if (!subs || typeof subs.listChildren !== 'function') {
        const err = new Error('the host exposes no subagents.listChildren, so live children cannot be reconciled')
        err.code = 'VMU_RESUME_CHILDREN_UNAVAILABLE'
        err.hint = 'the recovery port NAMES the gap instead of guessing the roster (docs/26 §3.22)'
        throw err
      }
      const rows = await subs.listChildren(parentId)
      return (Array.isArray(rows) ? rows : []).map((r) => (typeof r === 'string' ? r : (r && (r.id || r.sessionId || r.childId)) || null)).filter(Boolean)
    },
  }
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
  const kernel = createKernel(Object.assign({ sectionPolicy, noticeBlock, extraPhases, settings: settingsWithPackDefaults, root, spawn: spawnSeam, host: mathHost, deliverTurn: turnDeliver,
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
  const adapter = createHostAdapter(Object.assign({ ctx, kernel,
    // A caller may hand us a FAKE kernel (tests do): fall back to the deployment settings object when the real
    // `settingsView()` accessor is absent, so the live-resolution fix does not require a real kernel to exist.
    settings: typeof kernel.settingsView === 'function' ? kernel.settingsView() : settings,
    instance, scripts: Array.isArray(config.scripts) ? config.scripts : [],
    packLoader: packsDeclared ? () => packLoaderRef : null,
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
    mergeReport: () => ({
      priority: 'pack 默认 < preset Config／会话 settings < 运行时 set',
      packs: wantedPackIds.slice(),
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
  if (effectivePrompts.length > 0 && ctx && ctx.systemPrompt && typeof ctx.systemPrompt.section === 'function') {
    effect(() => {
      const order = typeof ctx.systemPrompt.getSectionOrder === 'function'
        ? ctx.systemPrompt.getSectionOrder('TEAM_POLICY') : undefined
      const text = effectivePrompts.map((s) => s.text).join('\n\n')
      const dispose = ctx.systemPrompt.section({ name: 'vmu', order, text })
      return typeof dispose === 'function' ? dispose : () => {}
    }, 'vmu:prompt')
  }

  // A PACK is where an institution lives (slots, tracks, rules, aliases). `config.packs` accepts either a
  // shipped pack id (resolved from packs/<id>.js) or an inline manifest; conflicts are refused (O4) and the
  // failure is visible instead of swallowed.
  // ROUND 1 / K5 (D-02, vmu-pack interface): `settingSource` lets the loader tell "this key belongs to a HIGHER
  // layer ⇒ my default is shadowed" from "it belongs to ANOTHER pack ⇒ named conflict"; `onPromptPolicy` is the sink
  // for a manifest's own `promptPolicies`, which is what makes a pack's prompt machinery pack-owned instead of
  // hard-wired here. Both are optional to the loader, so this call is safe before vmu-pack's side lands.
  const packLoader = createPackLoader({ kernel, registry: kernel.registry,
    settingSource: (key) => kernel.settingSource(key),
    onPromptPolicy: (p) => { promptPolicies.push(p) } })
  packLoaderRef = packLoader
  const packsWanted = Array.isArray(config.packs) ? config.packs : []
  const appliedPacks = []
  const packErrors = []
  if (!switchedOff && packsWanted.length > 0) {
    effect(() => {
      const run = (async () => {
        for (const wanted of packsWanted) {
          try {
            // GOAL 2: a pack may be a FOLDER - settings/ plus middleware/ plus an index.js manifest - or the older flat

            // module. The folder is tried first, and ONLY a module-not-found falls back: a real error inside the folder's

            // index must not be mistaken for "no folder", or a broken pack would silently load the flat one instead.

            let loaded = null

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

            }

            // A DATA-ONLY PACK IS ACTIVATED, NOT REFUSED. It has no manifest because it has no machinery: the plugin
            // already read its prompts/sections.json (and settings/defaults.json) by folder name before the kernel was
            // constructed, and those are the whole of what it contributes. Reporting it as "not applied" would tell a
            // deployment that turning on a text-only pack FAILED, while the text was in fact already in the pipeline -
            // so this branch records it as applied with nothing to apply, and only a name with neither a manifest NOR
            // data reaches the error path below.
            if (loaded === null) {
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

            const manifest = typeof wanted === 'string' ? loaded.PACK : wanted
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
      void run
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
    // ROUND 1 / K5 (D-02): the entry-side merge, in full - the priority ladder, the per-key layer, the named
    // conflicts and the overrides a deployment asked for. `vibe_vmu_status` reads the kernel's `settingsMerge`, which
    // carries the same two arrays; this accessor is for tests and for a host that wants the fact before kernel build.
    packMerge: () => ({
      priority: 'pack 默认 < preset Config／会话 settings < 运行时 set',
      packs: wantedPackIds.slice(),
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
    /** Resolves once the tools are registered and the declared middleware is activated. */
    ready: () => Promise.all([started, opened, Promise.resolve(adapter.status()), idsHydrated, resumed]).then(([, , st]) => st),
    started: () => started,
    storeOpened: () => opened,
    status: () => Object.assign(adapter.status(), { installError, settingsUnparsed: settingsUnparsed.slice(), settingsConflicts: settingsConflicts.slice() }),
    installError: () => installError,
    /** Round 6 B: what the entry could NOT turn into a setting, and what was declared in both shapes. */
    settingsUnparsed: () => settingsUnparsed.slice(),
    settingsConflicts: () => settingsConflicts.slice(),
    settings: () => Object.assign({}, settings),
    cleanups,
  }
}
