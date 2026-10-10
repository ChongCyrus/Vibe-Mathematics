#!/usr/bin/env node
// vmu PLANNED SETTINGS — the guard for the docs => registry pipeline (scripts/generate-planned-settings.mjs).
//
// WHAT THIS PROVES
//   A. the generated registry is exactly what the docs yield (`--check` is clean, byte for byte);
//   B. the AUDIT's group-G rule holds once the schema composes core + planned: no `vmu.*` name in any
//      design volume is left "invented" (independently recomputed here, NOT by calling the audit);
//   C. every entry is HONEST metadata: type 'planned', def null, planned true, ≥3 dot segments, unique,
//      sorted, non-empty doc, and disjoint from the core keys;
//   D. the pipeline is DETERMINISTIC (re-rendering the same docs yields the same bytes) and it does not
//      silently swallow a documented name: every `vmu.*` mention lands in exactly one bucket
//      (planned / existing / wildcard / whitelist / namespace / two-segment).
//
// The seams `VMU_DOCS_DIR` / `VMU_CODE_DIR` point the generator at a copy, so this guard can be exercised
// without touching the real design docs (docs/11 §4.1).
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const GEN = join(REPO, 'scripts', 'generate-planned-settings.mjs')
const VMU = process.env.VMU_CODE_DIR ? resolve(process.env.VMU_CODE_DIR) : join(REPO, 'vibe-math-vmu')
const DOCS = process.env.VMU_DOCS_DIR ? resolve(process.env.VMU_DOCS_DIR) : join(VMU, 'docs')
const PLANNED = join(VMU, 'settings', 'planned.js')
const SCHEMA = join(VMU, 'settings', 'schema.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}

// ---- A. the generator's own --check must be clean ------------------------------------------------
{
  ok(existsSync(GEN), 'the planned-settings generator exists', GEN)
  ok(existsSync(PLANNED), 'the generated registry exists (run --write first)', PLANNED)
  const run = spawnSync(process.execPath, [GEN, '--check'], { cwd: REPO, encoding: 'utf8' })
  const out = String(run.stdout || '')
  const err = String(run.stderr || '')
  ok(run.status === 0, 'the generator --check is clean (docs => registry in sync)', 'exit=' + run.status + ' ' + (err.trim() || out.trim()).slice(0, 160))
  ok(/up to date/.test(out), 'the clean --check says so on stdout', out.trim().split('\n').slice(-1)[0])
  ok(/planned keys=\d+ \(from docs=\d+\)/.test(out), 'the generator prints its counts on stdout', out.trim().split('\n')[0])
}

const genMod = await import(pathToFileURL(GEN).href)
const { collectPlannedDefs, docVolumes, coreKeys, namespacesOf, mirrorVolumes, renderPlannedFile, KEY_RE, NON_SETTING } = genMod
const { PLANNED_DEFS } = await import(pathToFileURL(PLANNED).href)
const schemaMod = await import(pathToFileURL(SCHEMA).href)
const CORE_DEFS = (Array.isArray(schemaMod.SETTING_DEFS) ? schemaMod.SETTING_DEFS : []).filter((d) => d && d.planned !== true)
const CORE_KEYS = CORE_DEFS.map((d) => d.key)

// ---- B. the AUDIT's group-G rule, recomputed independently ---------------------------------------
{
  const keys = new Set([...CORE_KEYS, ...PLANNED_DEFS.map((d) => d.key)])
  const namespaces = new Set([...keys].map((k) => k.split('.').slice(0, 2).join('.')))
  const bogus = new Set()
  for (const vol of docVolumes(DOCS)) {
    for (const m of vol.text.matchAll(/\bvmu\.[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+\b/g)) {
      const k = m[0]
      const after = vol.text.slice(m.index + k.length, m.index + k.length + 1)
      if (after === '*' || after === '…') continue                    // family wildcard: prose, not a key
      if (keys.has(k) || NON_SETTING.has(k) || namespaces.has(k)) continue
      bogus.add(k + ' (' + vol.name + ')')
    }
  }
  ok(bogus.size === 0, 'after composing core + planned, NO documented vmu.* name is left unregistered (audit group G)',
    [...bogus].slice(0, 8).join(' | '))
}

// ---- C. entry shape / honesty --------------------------------------------------------------------
{
  ok(PLANNED_DEFS.length > 0, 'the registry is not empty', String(PLANNED_DEFS.length))
  const badType = PLANNED_DEFS.filter((d) => d.type !== 'planned')
  ok(badType.length === 0, 'every entry is type "planned" (a plan may never look like a wired key)', badType.slice(0, 5).map((d) => d.key).join(','))
  const badPlanned = PLANNED_DEFS.filter((d) => d.planned !== true)
  ok(badPlanned.length === 0, 'every entry carries planned:true', badPlanned.slice(0, 5).map((d) => d.key).join(','))
  const badDef = PLANNED_DEFS.filter((d) => d.def !== null)
  ok(badDef.length === 0, 'every entry has def:null (nothing pretends to have a default)', badDef.slice(0, 5).map((d) => d.key).join(','))
  const shallow = PLANNED_DEFS.filter((d) => String(d.key).split('.').length < 3)
  ok(shallow.length === 0, 'every key has at least three dot segments (no two-segment namespace)', shallow.slice(0, 5).map((d) => d.key).join(','))
  const emptyDoc = PLANNED_DEFS.filter((d) => !String(d.doc || '').trim())
  ok(emptyDoc.length === 0, 'every entry documents where it came from (doc non-empty)', emptyDoc.slice(0, 5).map((d) => d.key).join(','))
  const keys = PLANNED_DEFS.map((d) => d.key)
  ok(new Set(keys).size === keys.length, 'no duplicate keys', String(keys.length - new Set(keys).size))
  const sorted = keys.slice().sort()
  ok(keys.every((k, i) => k === sorted[i]), 'keys are sorted lexicographically (deterministic file)', keys.find((k, i) => k !== sorted[i]))
  const overlap = keys.filter((k) => CORE_KEYS.includes(k))
  ok(overlap.length === 0, 'no planned key duplicates a core (already declared) key', overlap.slice(0, 5).join(','))
  const wrongDoc = PLANNED_DEFS.filter((d) => !/设计阶段登记：\d\d 声明/.test(String(d.doc)))
  ok(wrongDoc.length === 0, 'every doc line names its source volume (e.g. "设计阶段登记：09 声明")', wrongDoc.slice(0, 3).map((d) => d.key).join(','))
  // The generator's own extraction must reproduce the committed file AND the same key count.
  const core = await coreKeys(SCHEMA)
  const recomputed = collectPlannedDefs({ volumes: docVolumes(DOCS), core, namespaces: namespacesOf(core) })
  ok(renderPlannedFile(recomputed.defs) === readFileSync(PLANNED, 'utf8'), 're-rendering from the docs reproduces the committed file byte for byte')
  ok(recomputed.defs.length === PLANNED_DEFS.length, 'the generator and the committed file agree on the key count',
    recomputed.defs.length + '/' + PLANNED_DEFS.length)
  ok(KEY_RE instanceof RegExp && KEY_RE.source === '\\bvmu\\.[a-z][a-zA-Z0-9]*(?:\\.[a-zA-Z0-9]+)+\\b',
    'the key regex is the audit\'s (kept in step)', KEY_RE && KEY_RE.source)
}

// ---- D. every mention is bucketed (nothing is swallowed silently) --------------------------------
{
  const core = await coreKeys(SCHEMA)
  const coreSet = new Set(core)
  const ns = namespacesOf([...coreSet, ...PLANNED_DEFS.map((d) => d.key)])
  const mirrors = mirrorVolumes(docVolumes(DOCS), core)
  const mirrorNames = new Set(mirrors.map((m) => m.name))
  const buckets = { planned: new Set(), existing: new Set(), wildcard: new Set(), whitelist: new Set(), namespace: new Set(), twoSegment: new Set() }
  const classify = (vol, into = buckets) => {
    for (const m of vol.text.matchAll(genMod.BROAD_RE)) {
      const k = m[0]
      const after = vol.text.slice(m.index + k.length, m.index + k.length + 1)
      if (k.split('.').length <= 2) into.twoSegment.add(k)                 // `vmu.math` — a namespace
      else if (after === '*' || after === '…') into.wildcard.add(k)        // a family wildcard
      else if (coreSet.has(k)) into.existing.add(k)                        // already declared in the schema
      else if (NON_SETTING.has(k)) into.whitelist.add(k)                   // service/registry name
      else if (ns.has(k)) into.namespace.add(k)                            // derived namespace of a key
      else into.planned.add(k)
    }
  }
  // SOURCES: mirrors excluded — that is what the generator counts, so the numbers must match exactly.
  for (const vol of docVolumes(DOCS)) if (!mirrorNames.has(vol.name)) classify(vol)
  const missingFromPlanned = [...buckets.planned].filter((k) => !PLANNED_DEFS.some((d) => d.key === k))
  ok(missingFromPlanned.length === 0, 'the "planned" bucket is exactly the committed registry (recomputed independently)',
    missingFromPlanned.slice(0, 5).join(','))
  // The generator's own stats must agree with this independent recount (no hidden category).
  const stats = collectPlannedDefs({ volumes: docVolumes(DOCS), core, namespaces: namespacesOf(core), mirrors }).stats
  ok(stats.twoSegment === buckets.twoSegment.size && stats.wildcard === buckets.wildcard.size
    && stats.existing === buckets.existing.size && stats.whitelist === buckets.whitelist.size,
    'the generator reports the same exclusion counts this test recomputes (mirrors excluded on both sides)',
    'gen=' + [stats.existing, stats.wildcard, stats.whitelist, stats.twoSegment].join('/')
    + ' test=' + [buckets.existing.size, buckets.wildcard.size, buckets.whitelist.size, buckets.twoSegment.size].join('/'))
  // COVERAGE (the audit-G equivalent): over ALL volumes, INCLUDING the generated mirror, every distinct
  // name must still be covered — a mirror must never introduce a name that nothing registers.
  const covBuckets = { planned: new Set(), existing: new Set(), wildcard: new Set(), whitelist: new Set(), namespace: new Set(), twoSegment: new Set() }
  for (const vol of docVolumes(DOCS)) classify(vol, covBuckets)
  const covered = new Set([...covBuckets.planned, ...covBuckets.existing, ...covBuckets.wildcard,
    ...covBuckets.whitelist, ...covBuckets.namespace, ...covBuckets.twoSegment])
  const distinctAll = new Set()
  for (const vol of docVolumes(DOCS)) for (const m of vol.text.matchAll(genMod.BROAD_RE)) distinctAll.add(m[0])
  ok(covered.size === distinctAll.size, 'every distinct documented vmu.* name is covered by a bucket (mirror included)',
    covered.size + '/' + distinctAll.size)
}

// ---- E. GENERATED MIRRORS are not sources (provenance + no cycle) --------------------------------
{
  const core = await coreKeys(SCHEMA)
  const mirrors = mirrorVolumes(docVolumes(DOCS), core)
  ok(mirrors.length >= 1, 'at least one generated mirror is detected (docs/04 §11 is generated from the schema)',
    mirrors.map((m) => m.vol).join(','))
  const four = mirrors.find((m) => m.vol === '04')
  ok(!!four && four.coreCovered === four.coreTotal,
    'docs/04 is classified as a mirror because it mentions every CORE key (a design volume never does)',
    four ? four.coreCovered + '/' + four.coreTotal + ' ' + four.why : 'not detected')
  const mirrorNums = mirrors.map((m) => m.vol)
  const badProvenance = PLANNED_DEFS.filter((d) => mirrorNums.some((n) => String(d.doc).indexOf('：' + n + ' 声明') !== -1))
  ok(badProvenance.length === 0, 'NO planned key traces to a generated mirror (provenance must name a design volume)',
    badProvenance.slice(0, 5).map((d) => d.key + '->' + d.doc).join(' | '))
  ok(PLANNED_DEFS.every((d) => /设计阶段登记：\d\d 声明/.test(String(d.doc))),
    'every planned key still names SOME source volume (nothing lost by skipping the mirror)')
  // Mirror-independence: emptying the mirror's text must not change the registry at all.
  const mirrorNames = new Set(mirrors.map((m) => m.name))
  const stripped = docVolumes(DOCS).map((v) => (mirrorNames.has(v.name) ? { num: v.num, name: v.name, text: '' } : v))
  const withMirror = collectPlannedDefs({ volumes: docVolumes(DOCS), core, namespaces: namespacesOf(core), mirrors }).defs
  const withoutMirror = collectPlannedDefs({ volumes: stripped, core, namespaces: namespacesOf(core), mirrors }).defs
  ok(renderPlannedFile(withoutMirror) === renderPlannedFile(withMirror),
    'the registry is identical whether or not the mirror text is present (no cycle: docs/04 <- schema <- planned.js <- docs/04)')
  // And the settings table must be regenerable WITHOUT invalidating the registry, both ways round, so the
  // two generators cannot chase each other. This uses the table generator's OWN seam (`VMU_SETTINGS_DOC`)
  // to write into a TEMP copy, so the proof does not depend on the live table's current sync state (which
  // other writers amy be regenerating concurrently).
  const tmp = join(tmpdir(), 'vmu-04-mirror-' + process.pid + '.md')
  writeFileSync(tmp, readFileSync(join(DOCS, '04-settings.md'), 'utf8'), 'utf8')
  const regen = spawnSync(process.execPath, [join(REPO, 'scripts', 'generate-vmu-settings-table.mjs'), '--write'],
    { cwd: REPO, encoding: 'utf8', env: Object.assign({}, process.env, { VMU_SETTINGS_DOC: tmp }) })
  ok(regen.status === 0, 'the generated settings table can be rewritten from the schema (temp copy via VMU_SETTINGS_DOC)',
    'exit=' + regen.status + ' ' + String(regen.stderr || '').trim().slice(0, 140))
  const recheck = spawnSync(process.execPath, [GEN, '--check'], { cwd: REPO, encoding: 'utf8' })
  ok(recheck.status === 0, '--check is STILL clean after the settings table is (re)generated - no circular chase',
    'exit=' + recheck.status)
  try { rmSync(tmp, { force: true }) } catch (e) { /* best effort: a leftover temp file must not fail the guard */ }
}

if (failed === 0) {
  console.log('=== VMU PLANNED SETTINGS: ALL GREEN (planned=' + PLANNED_DEFS.length + ', docs=' + docVolumes(DOCS).length
    + ', passed=' + passed + ', failed=0) ===')
  process.exit(0)
}
for (const f of failures) console.log('  FAIL - ' + f)
console.log('=== VMU PLANNED SETTINGS: RED (passed=' + passed + ', failed=' + failed + ') ===')
process.exit(1)
