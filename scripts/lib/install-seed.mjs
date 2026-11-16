// dsh-vibe-math cold-start seed — THE ONE PLACE THAT ANSWERS "why is there only one tool?".
//
// WHY THIS EXISTS (round-1 audit, C#24 / P0-e): a fresh install ships `vibe-math-vmu/agent.cordis.yml` with NO
// `config:` on the framework row, and the adapter's documented zero-mechanism rule then publishes exactly ONE tool
// (`vibe_vmu_status`). The user sees a picker with one tool and no way to learn why or how to fix it. The audit's
// repair is a SEED: on install, write a minimal runnable config into the DEPLOYED preset copy, and record that it was
// seeded so `status`/doctor can say `configSource:"seeded"`.
//
// WHY THE SEED IS NOT PUT IN THE SHIPPED PRESET SOURCE: `tests/audit-preset-overlay-shape.test.mjs` (run 90,
// measured) forbids `config:` on that row in `agent.cordis.yml` and in the shipped overlay — the deployment injects
// `config` there (`packs`/`root`/`vmu`), and a second writer produced `YAMLException: duplicated mapping key` and a
// clean-room boot that exited 1 before the first tool call. The seed therefore touches ONLY the installed copy under
// the profile's preset root, and it never rewrites a row that already has a `config:` (a deployment's own config wins;
// we report `configSource:"preset"`).
//
// This module is PURE data + text + filesystem helpers. It never registers a tool and never reads the host: the doctor
// and the installer call it, and `kernel.status().coldStart` reads the FACTS they hand it.

/** The minimal runnable face set: every one of these resolves on a bare kernel with no pack, no durable root and no
 *  host math seam (they are the framework's own capability faces; `status` is always on). Kept deliberately small: a
 *  seed that turns everything on would re-create the "picker has 70 unknown tools" confusion at the other end. */
export const COLD_START_FACES = Object.freeze(['status', 'set', 'env', 'panel', 'mailbox', 'report', 'explain', 'clockguard'])

/** Nested declaration, in the shape `vibe-math-vmu.js#readSettings` documents (`config.vmu = {...}`). */
export function coldStartConfig() {
  return { vmu: { core: { enabled: true }, tools: { faces: COLD_START_FACES.slice() } } }
}

/** Flatten the nested declaration to the dotted settings keys the kernel actually reads (the entry's rule ①). */
export function flattenColdStartConfig(config) {
  const out = {}
  const walk = (prefix, node) => {
    for (const [k, v] of Object.entries(node || {})) {
      const key = prefix ? prefix + '.' + k : k
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) walk(key, v)
      else out[key] = v
    }
  }
  if (config && config.vmu && typeof config.vmu === 'object') walk('vmu', config.vmu)
  else walk('', config || {})
  return out
}

/** YAML text for the seed, indented to sit under a row's `config:` (base = the row item's own indentation). */
export function coldStartConfigYaml(rowIndent) {
  const pad = ' '.repeat(rowIndent)
  const faces = COLD_START_FACES.map((f) => "'" + f + "'").join(', ')
  return [
    pad + 'config:',
    pad + '  vmu:',
    pad + '    core:',
    pad + '      enabled: true',
    pad + '    tools:',
    pad + '      faces: [' + faces + ']',
  ].join('\n')
}

/** The vmu row of a preset file, by line: `{ start, end, nameLine, configLine }` (1-based lines; end is exclusive). */
export function findVmuRow(text, rowId = 'vibe-math-vmu') {
  const lines = String(text).split('\n')
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    if (new RegExp('^\\s*-\\s+id:\\s*' + rowId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$').test(lines[i])) { start = i; break }
  }
  if (start < 0) return null
  const indent = lines[start].match(/^ */)[0].length
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    const lead = lines[i].match(/^ */)[0].length
    if (/^\s*-\s/.test(lines[i]) && lead <= indent) { end = i; break }
    if (/^\s*[A-Za-z]/.test(lines[i]) && lead < indent) { end = i; break }
  }
  let nameLine = -1
  let configLine = -1
  for (let i = start + 1; i < end; i++) {
    if (/^\s+name:\s*/.test(lines[i]) && nameLine < 0) nameLine = i
    if (new RegExp('^\\s{0,' + (indent + 2) + '}config:\\s*$').test(lines[i])) { configLine = i; break }
  }
  return { start, end, nameLine, configLine, indent }
}

/**
 * Seed one preset file's vmu row. NEVER overwrites a row that already has `config:` (that is the deployment's own
 * declaration — `configSource:"preset"`). Returns a receipt, not a boolean, because "already configured" and "the row
 * is not there" are different facts and a silent no-op is what this audit class exists to remove.
 * @param {string} text - the preset file's text
 * @param {{rowId?: string, indent?: number}} [opts]
 */
export function seedPresetText(text, opts = {}) {
  const rowId = opts.rowId || 'vibe-math-vmu'
  const row = findVmuRow(text, rowId)
  if (!row) return { ok: false, seeded: false, why: 'row-absent', code: 'VMU_SEED_ROW_ABSENT', text: String(text) }
  if (row.configLine >= 0) return { ok: true, seeded: false, why: 'already-configured', configSource: 'preset', text: String(text) }
  const at = (row.nameLine >= 0 ? row.nameLine : row.start) + 1 // insert right after `name:` (0-based index)
  const lines = String(text).split('\n')
  const block = coldStartConfigYaml(row.indent + 2).split('\n')
  lines.splice(at, 0, ...block)
  return { ok: true, seeded: true, why: 'seeded', configSource: 'seeded', text: lines.join('\n'), insertedAt: at + 1,
    faces: COLD_START_FACES.slice(), config: coldStartConfig() }
}

/** Where the seed marker lives inside an installed preset directory. Runtime profile state, not a repo file. */
export const SEED_MARKER = '.vibe-math-cold-start.json'

/** Read the config source of a preset file without touching it: `preset` (row has config), `seeded` (marker), `none`. */
export function configSourceOf(text, marker = null) {
  const row = findVmuRow(text)
  const hasConfig = !!(row && row.configLine >= 0)
  const blockOf = () => {
    if (!hasConfig) return ''
    const lines = String(text).split('\n')
    const indent = lines[row.configLine].match(/^ */)[0].length
    const out = []
    for (let i = row.configLine; i < lines.length; i++) {
      if (i > row.configLine) {
        const lead = lines[i].match(/^ */)[0].length
        if (lines[i].trim() !== '' && lead <= indent - 2) break
      }
      out.push(lines[i])
    }
    return out.join('\n').trim()
  }
  const currentBlock = blockOf()
  const blockHash = currentBlock === '' ? null : sha256Of(currentBlock)
  if (marker && marker.kind === 'seeded' && marker.rowConfigHash && blockHash === marker.rowConfigHash) {
    return { value: 'seeded', evidence: 'the seed marker records this exact config block (' + marker.rowConfigHash.slice(0, 12) + '…): an installer/doctor seed wrote it and it is byte-identical since', at: SEED_MARKER }
  }
  if (hasConfig) {
    return { value: 'preset', evidence: marker && marker.rowConfigHash
      ? 'the row carries a config: block that does NOT match the seed marker (byte-different), so a deployment owns/edited it'
      : 'the preset row itself carries a config: block (the deployment declared it)', at: 'agent.cordis.yml' }
  }
  if (marker && marker.kind === 'seeded') {
    return { value: 'seeded', evidence: 'the row config is gone but the seed marker remains: it was seeded once and later removed by hand', at: SEED_MARKER }
  }
  return { value: 'none', evidence: 'the preset row has no config: and no seed marker exists, so the adapter runs its documented zero-mechanism default (exactly one tool)', at: 'agent.cordis.yml' }
}

/** sha256 (hex) — the marker anchors the EXACT seeded block, so a later deployment edit is detectable, not assumed. */
function sha256Of(text) {
  try { return createHash('sha256').update(String(text), 'utf8').digest('hex') } catch { return null }
}

/** Read the config source of a preset file without touching it: `preset` (row has config), `seeded` (marker), `none`. */
// ── filesystem half (the installer and the doctor share it) ─────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

export function seedPaths({ presetRoot, presetDir = 'vibe-math-vmu' }) {
  const dir = join(String(presetRoot), String(presetDir))
  return { dir, preset: join(dir, 'agent.cordis.yml'), marker: join(dir, SEED_MARKER) }
}

/** Read the installed preset's cold-start state without modifying anything (the doctor's read path). */
export function readSeedState({ presetRoot, presetDir = 'vibe-math-vmu' }) {
  const paths = seedPaths({ presetRoot, presetDir })
  if (!existsSync(paths.preset)) {
    return { present: false, markerPresent: false, markerError: null, source: { value: 'none', evidence: 'no installed preset file at ' + paths.preset + ', so nothing can declare a config here', at: paths.preset }, config: null, paths }
  }
  const text = readFileSync(paths.preset, 'utf8')
  // ★ THE MARKER IS OPTIONAL BY DESIGN — a hand-configured profile has none, and that absence IS a state, not an empty
  // fallback: it is reported as markerPresent:false. A CORRUPT marker is a NAMED error (never a quiet "no seed"), so the
  // doctor can tell "the profile was never seeded" from "the seed bookkeeping is broken" - two different repairs.
  // (tests/audit-no-silent-reads.test.mjs: this shape is an if-block, not a degraded ternary read; nothing is turned
  // into an empty value silently.)
  let marker = null
  let markerError = null
  const markerPresent = existsSync(paths.marker)
  if (markerPresent) {
    try { marker = JSON.parse(readFileSync(paths.marker, 'utf8')) } catch (e) {
      markerError = { code: 'VMU_SEED_MARKER_CORRUPT', path: paths.marker, message: String((e && e.message) || e),
        means: 'the seed marker exists but is not readable JSON: the profile WAS seeded (or hand-copied) once, and its bookkeeping is broken; configSource falls back to the row evidence below, and the repair is to re-run the doctor --seed (which rewrites the marker)' }
    }
  }
  const source = configSourceOf(text, marker)
  return { present: true, text, marker, markerPresent, markerError, source, config: marker && marker.config ? marker.config : coldStartConfig(), paths }
}

/**
 * Seed an INSTALLED preset copy (never the repo source, see the header). Idempotent and non-destructive: an existing
 * `config:` block is left byte-identical (the deployment's declaration wins and is reported as `preset`), and the file
 * is replaced atomically so a crash cannot leave a half-written preset the next same-version run mistakes for a user
 * edit.
 * @returns a receipt naming what happened; never throws for a missing preset (that is a named fact).
 */
export function seedInstalledPreset({ presetRoot, presetDir = 'vibe-math-vmu', at = null, logger = null } = {}) {
  const paths = seedPaths({ presetRoot, presetDir })
  const say = (m) => { try { if (typeof logger === 'function') logger(m) } catch { /* logging never breaks an install */ } }
  if (!existsSync(paths.preset)) {
    return { ok: false, seeded: false, why: 'preset-absent', code: 'VMU_SEED_PRESET_ABSENT', paths, means: 'no installed preset to seed at ' + paths.preset }
  }
  let text = ''
  try { text = readFileSync(paths.preset, 'utf8') } catch (e) {
    return { ok: false, seeded: false, why: 'unreadable', code: 'VMU_SEED_UNREADABLE', message: String((e && e.message) || e), paths }
  }
  const seeded = seedPresetText(text)
  if (!seeded.ok) return { ...seeded, paths, means: 'the installed preset has no `vibe-math-vmu` row, so there is nowhere to seed a config; the preset is not this bundle\'s (repair: reinstall the bundle)' }
  if (!seeded.seeded) {
    return { ok: true, seeded: false, why: seeded.why, configSource: 'preset', paths,
      means: 'the row already carries a config: block — the deployment\'s own declaration is left untouched (configSource:"preset")' }
  }
  try {
    mkdirSync(paths.dir, { recursive: true })
    const tmp = paths.preset + '.' + process.pid + '.vibe-math-seed-tmp'
    writeFileSync(tmp, seeded.text)
    renameSync(tmp, paths.preset)
    const marker = { schema: 1, kind: 'seeded', at: at === null ? new Date().toISOString() : String(at), rowConfigHash: sha256Of((coldStartConfigYaml(2)).trim()),
      generator: 'dsh-vibe-math/install-seed', faces: COLD_START_FACES.slice(), config: coldStartConfig() }
    writeFileSync(paths.marker, JSON.stringify(marker, null, 2) + '\n')
    say('vmu cold start: seeded a minimal runnable config into ' + paths.preset)
    return { ok: true, seeded: true, why: 'seeded', configSource: 'seeded', paths, marker,
      faces: COLD_START_FACES.slice(), means: 'a minimal face set was written so a fresh profile publishes more than the single status tool; configSource is now "seeded" and the marker records exactly what was written' }
  } catch (e) {
    return { ok: false, seeded: false, why: 'write-failed', code: 'VMU_SEED_WRITE_FAILED', message: String((e && e.message) || e), paths }
  }
}
