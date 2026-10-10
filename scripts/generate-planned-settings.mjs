#!/usr/bin/env node
// vmu PLANNED SETTINGS PIPELINE — docs (single source of truth) => planned key registry.
//
// WHY THIS EXISTS
//   The design volumes name several hundred adjustable parameters. Until now every one of them made
//   `tests/audit-vmu-docs.test.mjs` RED, because the audit (group G) requires every `vmu.*` name in the
//   docs to exist in `vibe-math-vmu/settings/schema.js` - and a design key is, by definition, not wired
//   yet. That turned "we documented a plan" into "nobody may commit".
//
//   This generator closes the gap HONESTLY: it derives the planned keys FROM THE DOCS and writes a
//   registry (`settings/planned.js`) whose entries are typed `planned: true`, `def: null` - so the
//   generated settings table shows them as 未接线（changed nothing = no behaviour） and nobody can mistake
//   a documented plan for a shipped parameter. `settings/schema.js` composes
//   `SETTING_DEFS = [...core, ...PLANNED_DEFS]`, which is what flips audit group G green.
//
// USAGE
//   node scripts/generate-planned-settings.mjs --write    rewrite settings/planned.js from the docs
//   node scripts/generate-planned-settings.mjs --check    fail (exit 1, with the key difference) if the
//                                                        file is not exactly what the docs yield
//   node scripts/generate-planned-settings.mjs --json     machine-readable summary on stdout
//
// EXTRACTION RULES (byte-identical to tests/audit-vmu-docs.test.mjs group G - keep them in step)
//   · key shape: /\bvmu\.[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+\b/g
//   · EXCLUDE a wildcard family (`vmu.math.lean*`, `vmu.math.precision.*`, `vmu.x.…`)
//   · EXCLUDE names that already exist in the schema (core keys), their derived namespaces (two segments)
//   · EXCLUDE the audit's NON_SETTING service/registry names
//   · EXCLUDE two-segment namespaces (`vmu.math`) - they are not keys
//
// GENERATED MIRRORS ARE NOT SOURCES (bug fix, measured 2026-10):
//   `docs/04-settings.md` §11 is GENERATED FROM THE SCHEMA, so it mentions every composed key (404 of
//   them). Scanning it as a design source mis-attributed every planned key to volume "04" and created a
//   cycle (docs/04 <- schema <- planned.js <- docs/04): the table and the registry chased each other, and
//   the real provenance (07/08/09/13/15) was lost. A volume is now a MIRROR - never a source - when its
//   name is in MIRROR_PREFIXES, OR when it mentions (almost) every CORE key (a design volume never does:
//   measured 04 covers 54/54 core keys while docs/09 and docs/15 cover only the ~14 implemented ones).
//   MEASURED CONSEQUENCE of skipping 04 as a source: nothing is lost - the 16 keys that appear ONLY in 04
//   are all CORE keys - and the docs audit's group G stays green (measured: 0 uncovered names).
//
// `existing` SEMANTICS: the keys the schema ALREADY declares BY HAND - i.e. CORE_DEFS, never the composed
//   SETTING_DEFS (after composition the latter contains every planned key, so excluding it whole would
//   drop all 350). `coreKeys()` prefers an exported CORE_DEFS and otherwise derives the core set as
//   `SETTING_DEFS.filter(d => d.planned !== true)`.
//
// DETERMINISM: doc set is discovered and sorted; keys are sorted lexicographically; a key that appears in
// more than one volume is attributed to the LOWEST volume number (mirrors excluded). Running the generator
// twice yields the same bytes (the test asserts it).
//
// SEAMS (docs/11 §4.1): `VMU_DOCS_DIR` / `VMU_CODE_DIR` point this script at a COPY, so the planned-key
// pipeline can be exercised without touching the real design docs.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')

/** The design volumes. Discovered, never remembered (the audit does the same). */
export const DOCS_DIR = process.env.VMU_DOCS_DIR
  ? resolve(process.env.VMU_DOCS_DIR)
  : join(REPO, 'vibe-math-vmu', 'docs')
/** The vmu source root (holds settings/schema.js and gets settings/planned.js). */
export const VMU_DIR = process.env.VMU_CODE_DIR
  ? resolve(process.env.VMU_CODE_DIR)
  : join(REPO, 'vibe-math-vmu')
export const SCHEMA_FILE = join(VMU_DIR, 'settings', 'schema.js')
export const OUT_FILE = join(VMU_DIR, 'settings', 'planned.js')

/** Key shape — VERBATIM from the audit's group G. */
export const KEY_RE = /\bvmu\.[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+\b/g
/** Broader scan: also catches two-segment namespaces so they can be COUNTED as an exclusion, not silently lost. */
export const BROAD_RE = /\bvmu\.[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)*\b/g
/** SERVICE / registry names that are dotted like keys but are not settings — VERBATIM from the audit. */
export const NON_SETTING = new Set(['vmu.prompt', 'vmu.library', 'vmu.members', 'vmu.tasks', 'vmu.store', 'vmu.bus',
  'vmu.kernel', 'vmu.settings', 'vmu.rules', 'vmu.bridge', 'vmu.loader', 'vmu.registry', 'vmu.meetings',
  'vmu.budget', 'vmu.packs', 'vmu.middleware', 'vmu.records', 'vmu.core', 'vmu.limits', 'vmu.safety',
  'vmu.math', 'vmu.ballot', 'vmu.meeting', 'vmu.schema', 'vmu.status'])

/** The discovered volumes: [{ num: '07', name: '07-durability-library', text }], sorted by number. */
export function docVolumes(dir = DOCS_DIR) {
  return readdirSync(dir)
    .filter((f) => /^\d\d-[A-Za-z0-9-]+\.md$/.test(f))
    .sort()
    .map((f) => {
      const name = f.replace(/\.md$/, '')
      return { num: name.slice(0, 2), name, text: readFileSync(join(dir, f), 'utf8') }
    })
}

/**
 * The keys the schema ALREADY declares BY HAND — never the composed `SETTING_DEFS` as a whole (after the
 * composition it contains every planned key, so filtering it as a whole would exclude all of them).
 * Prefers an explicitly exported `CORE_DEFS`; otherwise derives the core set as `planned !== true`.
 */
export async function coreKeys(file = SCHEMA_FILE) {
  const mod = await import(pathToFileURL(file).href)
  const defs = Array.isArray(mod.CORE_DEFS)
    ? mod.CORE_DEFS
    : (Array.isArray(mod.SETTING_DEFS) ? mod.SETTING_DEFS.filter((d) => d && d.planned !== true) : [])
  return defs.map((d) => d.key)
}

/** Derived namespaces of the core keys (two segments) — the audit treats these as not-a-key claims. */
export function namespacesOf(keys) {
  return new Set([...keys].map((k) => k.split('.').slice(0, 2).join('.')))
}

/**
 * Volumes that are GENERATED FROM THE SCHEMA and must never be a source of planned keys.
 * `04-settings.md` §11 is the generated settings table (its keys come from settings/schema.js): scanning
 * it would mis-attribute every key to volume 04 AND create a cycle (docs/04 <- schema <- planned.js <- 04).
 */
export const MIRROR_PREFIXES = ['04-']
/**
 * A volume is a generated mirror when it is named above, OR when it mentions EVERY core key (threshold
 * 1.0 by default). The coverage rule must be ALL, not "most": a design volume that merely QUOTES the
 * settings table covers almost all core keys - measured: docs/12 (user guide) covers 51/54 = 94%, while
 * the generated docs/04 covers 54/54 = 100%. A 90% cut silently dropped docs/12 as a source, which would
 * have hidden real declarations (and could drop a key nothing else registers).
 */
export function mirrorVolumes(volumes, core, opts = {}) {
  const threshold = opts.threshold === undefined ? 1 : opts.threshold
  const coreSet = new Set(core)
  const out = []
  for (const vol of volumes) {
    const seen = new Set()
    for (const m of vol.text.matchAll(BROAD_RE)) if (coreSet.has(m[0])) seen.add(m[0])
    const byName = MIRROR_PREFIXES.some((p) => vol.name.startsWith(p))
    const byCoverage = core.length > 0 && seen.size / core.length >= threshold
    if (byName || byCoverage) {
      out.push({ vol: vol.num, name: vol.name, coreCovered: seen.size, coreTotal: core.length,
        why: byName ? 'generated-mirror-by-name' : 'generated-mirror-by-core-coverage' })
    }
  }
  return out
}

/**
 * Collect the planned keys from the volumes. Pure (all inputs injected) so the test can recompute it.
 * MIRROR volumes are skipped as sources (they are generated from the schema). Each key records EVERY
 * volume that declares it (`volumes`, sorted) - a single "first volume" would imply a unique provenance
 * that a design set with cross-references does not have. Returns { defs, stats } where stats carries
 * every exclusion counter, the mirror list and the multi-volume count (the report quotes them).
 */
export function collectPlannedDefs({ volumes, core, namespaces, mirrors }) {
  const coreSet = new Set(core)
  const nsSet = namespaces instanceof Set ? namespaces : namespacesOf(core)
  const mirrorList = mirrors || mirrorVolumes(volumes, core)
  const mirrorNames = new Set(mirrorList.map((m) => m.name))
  const planned = new Map()                 // key -> Set(declaring volume numbers)
  const excluded = { existing: new Set(), wildcard: new Set(), whitelist: new Set(), twoSegment: new Set(), namespace: new Set() }
  let mentions = 0
  let mirrorMentions = 0
  for (const vol of volumes) {
    const isMirror = mirrorNames.has(vol.name)
    for (const m of vol.text.matchAll(BROAD_RE)) {
      if (isMirror) { mirrorMentions++; continue }                               // generated mirror: not a source
      mentions++
      const k = m[0]
      const parts = k.split('.')
      if (parts.length <= 2) { excluded.twoSegment.add(k); continue }            // `vmu.math` — a namespace
      const after = vol.text.slice(m.index + k.length, m.index + k.length + 1)
      if (after === '*' || after === '…') { excluded.wildcard.add(k); continue } // a family wildcard
      if (coreSet.has(k)) { excluded.existing.add(k); continue }                 // already declared
      if (NON_SETTING.has(k)) { excluded.whitelist.add(k); continue }            // service/registry name
      if (nsSet.has(k)) { excluded.namespace.add(k); continue }                  // derived namespace of a key
      const decl = planned.get(k) || new Set()
      decl.add(vol.num)                                                          // EVERY declaring volume
      planned.set(k, decl)
    }
  }
  const keys = [...planned.keys()].sort()
  const defs = keys.map((key) => {
    const vols = [...planned.get(key)].sort()                                    // deterministic order
    const first = vols[0]
    return {
      key,
      type: 'planned',
      def: null,
      hot: 'H1',
      who: 'office',
      scope: 'global',
      planned: true,
      volumes: vols,
      doc: '设计阶段登记：首个声明卷 ' + first + '（共见 ' + vols.length + ' 卷：' + vols.join('、') + '），尚未实现（元数据以各卷为准）',
    }
  })
  const countFor = (num) => defs.filter((d) => d.volumes.indexOf(num) !== -1).length
  const stats = {
    mentions,
    mirrorMentions,
    mirrors: mirrorList,
    existing: excluded.existing.size,
    wildcard: excluded.wildcard.size,
    whitelist: excluded.whitelist.size,
    twoSegment: excluded.twoSegment.size,
    namespace: excluded.namespace.size,
    multiVolume: defs.filter((d) => d.volumes.length > 1).length,
    byVolume: volumes.map((v) => ({ vol: v.num, keys: countFor(v.num) })),
  }
  return { defs, stats }
}

/** The exact bytes of settings/planned.js for a given list of defs (deterministic). */
export function renderPlannedFile(defs) {
  const header = [
    '// GENERATED FILE — DO NOT EDIT BY HAND.',
    '// Source of truth: the DESIGN volumes under vibe-math-vmu/docs/ (discovered, never remembered).',
    '// Regenerate:  node scripts/generate-planned-settings.mjs --write',
    '// Verify:      node scripts/generate-planned-settings.mjs --check',
    '//',
    '// Every entry below is DECLARED IN THE DOCS and NOT WIRED to runtime code: type "planned", def null.',
    '// settings/schema.js composes SETTING_DEFS = [...core, ...PLANNED_DEFS] so the docs audit can tell',
    '// "planned" apart from "invented", and the generated settings table shows these rows as 未接线.',
    '// GENERATED MIRRORS ARE NOT SOURCES: docs/04-settings.md §11 is generated FROM the schema, so it is',
    '// skipped (by name and by core-key coverage) - otherwise every key would be attributed to 04 and the',
    '// table <-> registry cycle would make the two files chase each other.',
    '// PROVENANCE IS MULTI-VOLUME: `volumes` lists EVERY design volume that declares the key (sorted), so a',
    '// key that two volumes both describe is not silently presented as having a single source. The `doc`',
    '// text names the FIRST volume explicitly ("首个声明卷") together with the full list.',
    '// Keys are sorted lexicographically; the file is byte-stable (the test asserts it).',
    'export const PLANNED_DEFS = Object.freeze([',
  ]
  const body = defs.map((d) => '  { key: ' + JSON.stringify(d.key) + ", type: 'planned', def: null, hot: 'H1', who: 'office', scope: 'global', planned: true, volumes: ["
    + d.volumes.map((v) => JSON.stringify(v)).join(', ') + '], doc: ' + JSON.stringify(d.doc) + ' },')
  return header.concat(body, ['])', '']).join('\n')
}

/** Keys present in a rendered/checked file — used to print a readable diff. */
export function keysOf(text) {
  const out = []
  for (const m of String(text || '').matchAll(/key:\s*"([^"]+)"/g)) out.push(m[1])
  return out
}

async function main() {
  const argv = process.argv.slice(2)
  const write = argv.includes('--write')
  const asJson = argv.includes('--json')
  const volumes = docVolumes()
  const core = await coreKeys()
  const mirrors = mirrorVolumes(volumes, core)
  const { defs, stats } = collectPlannedDefs({ volumes, core, namespaces: namespacesOf(core), mirrors })
  const next = renderPlannedFile(defs)
  const prev = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, 'utf8') : null
  const stale = prev !== next

  if (asJson) {
    console.log(JSON.stringify({
      plannedKeys: defs.length, docs: volumes.length, stale,
      byVolume: stats.byVolume, mirrors: stats.mirrors, multiVolume: stats.multiVolume, excluded: {
        existing: stats.existing, wildcard: stats.wildcard, whitelist: stats.whitelist,
        twoSegment: stats.twoSegment, namespace: stats.namespace,
      },
      mentions: stats.mentions, mirrorMentions: stats.mirrorMentions,
    }, null, 2))
  }

  console.log('planned keys=' + defs.length + ' (from docs=' + volumes.length + ')')
  console.log('  by volume (ALL declarations): ' + stats.byVolume.filter((v) => v.keys > 0).map((v) => v.vol + '=' + v.keys).join(' '))
  console.log('  multi-volume keys: ' + stats.multiVolume + '/' + defs.length
    + ' (declared by more than one design volume; each entry lists them all in `volumes`)')
  console.log('  mirrors skipped as sources: ' + (stats.mirrors.length
    ? stats.mirrors.map((m) => m.vol + ' (core ' + m.coreCovered + '/' + m.coreTotal + ', ' + m.why + ')').join(', ')
    : 'none'))
  console.log('  excluded (distinct names): existing=' + stats.existing + ' wildcard=' + stats.wildcard
    + ' whitelist=' + stats.whitelist + ' namespace=' + stats.namespace + ' twoSegment=' + stats.twoSegment
    + ' (raw mentions=' + stats.mentions + ', mirror mentions=' + stats.mirrorMentions + ')')

  if (!stale) {
    console.log('planned settings: up to date (' + defs.length + ' planned keys)')
    if (write) console.log('planned settings: --write requested, file already matches (nothing written)')
    process.exit(0)
  }
  if (write) {
    writeFileSync(OUT_FILE, next, 'utf8')
    console.log('planned settings: REWRITTEN from the docs (' + defs.length + ' planned keys, ' + next.split('\n').length + ' lines)')
    process.exit(0)
  }
  // --check (the default): print the difference, then fail.
  const was = new Set(keysOf(prev))
  const now = new Set(keysOf(next))
  const added = [...now].filter((k) => !was.has(k))
  const removed = [...was].filter((k) => !now.has(k))
  console.error('planned settings: STALE — settings/planned.js is not what the docs yield (' + defs.length + ' planned keys)')
  if (added.length) console.error('  missing from planned.js (' + added.length + '): ' + added.slice(0, 8).join(', ') + (added.length > 8 ? ' …' : ''))
  if (removed.length) console.error('  no longer declared in the docs (' + removed.length + '): ' + removed.slice(0, 8).join(', ') + (removed.length > 8 ? ' …' : ''))
  console.error('  run: node scripts/generate-planned-settings.mjs --write')
  process.exit(1)
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main()
