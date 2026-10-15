// vmu docs & surface audit — the repository-side guard for the vmu design set (docs/00–14).
//
// Until now the design set was guarded by a linter that lives OUTSIDE the repository (_oneoff/vmu/tools/
// check-docs.mjs). That means a clone of this package carries no guard of its own: the docs could drift
// from the code and no shipped job would notice. This job brings the essential checks in-repo, so the
// package's own gate covers its own documentation:
//
//   A. every design doc 00..14 exists and is non-trivial;
//   B. every `VMU_*` code that appears in the DOCS is registered in the 03 error-code table;
//   C. every `VMU_*` code that appears in the vmu CODE is registered there too (a code the code can throw
//      but the contract does not list is exactly the drift that made the docs useless before);
//   D. the docs<->module surface check (03 §2.1 rows vs the public surfaces the modules expose);
//   E. every doc that must declare its open questions has a "未核项" section (docs/02, 03, 08, 12 …).
//
// `tests/audit-vmu-docs.mutants.mjs` breaks each of these one at a time and requires the named red.

import { hasConsumer } from '../scripts/generate-vmu-settings-table.mjs'
// ROUND 14 / task-101 ④: the service-name table is a SINGLE exported source now. This audit carried its own copy and
// the two had already drifted apart - this one said `vmu.dissemination.impact`/`mediaRequest` (both had since become
// REAL setting keys) while the generator said `vmu.outreach.impact`/`mediaRequest` (the family as it was named BEFORE
// ROUND 218 renamed it, so they match nothing). A duplicated invariant is a duplicated place to be wrong; one place now.
import { NON_SETTING, MIRROR_PREFIXES as SETTINGS_MIRROR_PREFIXES } from '../scripts/generate-planned-settings.mjs'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { TOOL_NAMES } from '../vibe-math-vmu/host.js'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
// INJECTED ROOTS (docs/11 §4.1 seam discipline): the mutant family points these at a mutated COPY, so the
// audit can be proven to fail without ever touching the real files.
const DOCS = process.env.VMU_DOCS_DIR ? resolve(process.env.VMU_DOCS_DIR) : join(REPO, 'vibe-math-vmu', 'docs')
const VMU = process.env.VMU_CODE_DIR ? resolve(process.env.VMU_CODE_DIR) : join(REPO, 'vibe-math-vmu')

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}

// The doc set is DISCOVERED, never remembered: a hard-coded filename list drifts silently (the first
// version of this audit listed six names that do not exist).
const DOC_FILES = readdirSync(DOCS)
  .filter((f) => /^\d\d-[A-Za-z0-9-]+\.md$/.test(f))
  .map((f) => f.replace(/\.md$/, ''))
  .sort()
// The set is DISCOVERED *and it GROWS*: the volume map (00 §3) may add 15, 16, ... as the design phase
// expands, so the guard is a FLOOR plus CONTIGUITY from 00 - never an equality. The equality is what forced a
// growing design set into exactly fifteen files, which made the audit itself the bottleneck of the expansion.
ok(DOC_FILES.length >= 15, 'the design set has at least the 15 core docs (00..14)', DOC_FILES.join(','))
{
  const nums = DOC_FILES.map((n) => Number(n.slice(0, 2)))
  ok(nums.every((n, i) => n === i), 'the design set is numbered contiguously from 00 with no gaps', nums.join(','))
}

// ---- A. the design set exists and is non-trivial -------------------------------------------------
// ROUND 224: the open-items ledger is a changelog and is excluded here for the same reason the generator excludes it as a
// source. Delete a file from this list only together with the generator's provenance rule, or the two disagree.
// A changelog is identified by being a changelog, not by one number: the roadmap ledger split into a live volume
// (14-) and a history volume (28-) in round 420, and both narrate rounds while quoting key names.
const LEDGER_PREFIXES = ['14-', '28-']
const LEDGER_PREFIX = LEDGER_PREFIXES[0]
const docText = new Map()
ok(DOC_FILES.length > 0, 'non-vacuous: DOC_FILES must not be empty')
for (const name of DOC_FILES) {
  const p = join(DOCS, name + '.md')
  if (!existsSync(p)) { ok(false, 'design doc exists: ' + name, 'missing'); continue }
  const text = readFileSync(p, 'utf8')
  docText.set(name, text)
  ok(text.length > 800, 'design doc is non-trivial: ' + name, text.length + ' chars')
}
ok(docText.size === DOC_FILES.length, 'every design doc 00..14 is present',
  [...docText.keys()].length + '/' + DOC_FILES.length)

// ---- B. codes used in the DOCS are registered in 03's table --------------------------------------
const contract = docText.get('03-interface-contract') || ''
// A registration row may list SEVERAL codes in its first column (`| \`A\` / \`B\` |`), so every code in
// that column counts as registered - taking only the first one produced four false positives.
const registered = new Set()
for (const row of contract.matchAll(/^\| ([^|]+)\|/gm)) {
  // ANY registered code, including the SHARED-MODULE namespaces (`MATH_*`/`ARCHIVE_*`/`SCRIPT_*`) - the old
  // scan only read `VMU_*`, so the shared table could not have satisfied the checks that now include them.
  for (const m of row[1].matchAll(/`((?:VMU|MATH|ARCHIVE|SCRIPT)_[A-Z0-9_]+)`/g)) registered.add(m[1])
}
ok(registered.size >= 15, 'the error-code table registers a substantial set', registered.size)
// A FAMILY PREFIX (`VMU_ARCHIVE_`) is prose about a namespace, not a claim that a code exists. This used to
// also exempt any code CONTAINING "PACKID"/"REASON", which silently skipped REAL codes whose last segment is
// the word REASON (`VMU_REASON_REQUIRED`, `VMU_DELEGATION_REASON_REQUIRED`) - an independent reviewer proved
// the hole. The only placeholder form is the trailing-underscore family prefix.
const isPlaceholder = (code) => code.endsWith('_')
// SHARED-MODULE CODES (independent reviewer, round 5): the math / archive / script modules throw their own
// codes (`MATH_ENGINE_NOT_FOUND`, `ARCHIVE_RETENTION_EXCEEDED`, `SCRIPT_CHANGED_DURING_RUN`, ...) and the old
// scan only looked at `VMU_*`, so half of the "named refusals" were outside the registration gate entirely.
// They are registered in 03-§8's shared-module table and checked in BOTH directions from now on.
const CODE_RE = /\b((?:VMU|MATH|ARCHIVE|SCRIPT)_[A-Z0-9_]{3,})\b/g
const CODE_LITERAL_RE = /['"`]((?:VMU|MATH|ARCHIVE|SCRIPT)_[A-Z0-9_]{3,})['"`]/g
const codeUse = new Map()
// GENERATED REGIONS ARE NOT PROSE. The kernel index in docs/02 is generated from the modules' headers and lists their EXPORT
// names beside their purpose; ARCHIVE_KINDS and MATH_KEYS are exports, not the refusal codes this check is about. The
// exemption is asserted below, so it cannot outlive the delimiters it depends on.
const GEN_BEGIN = '<!-- BEGIN GENERATED: kernel-index -->'
const GEN_END = '<!-- END GENERATED: kernel-index -->'
let generatedRegions = 0
for (const [name, rawText] of docText) {
      if (LEDGER_PREFIXES.some((p) => name.startsWith(p))) continue   // ROUND 224: a changelog is not a declaration source
  let text = rawText
  while (text.includes(GEN_BEGIN) && text.indexOf(GEN_END) > text.indexOf(GEN_BEGIN)) {
    const a = text.indexOf(GEN_BEGIN)
    const b = text.indexOf(GEN_END)
    text = text.slice(0, a) + text.slice(b + GEN_END.length)
    generatedRegions += 1
  }

  for (const m of text.matchAll(CODE_RE)) {
    const code = m[1]
    if (isPlaceholder(code)) continue
    if (!codeUse.has(code)) codeUse.set(code, new Set())
    codeUse.get(code).add(name)
  }
}
ok(generatedRegions >= 1,
  'the generated region this check skips is really present, so the exemption above rests on a declaration rather than on hope',
  { generatedRegions })

// API NAMES ARE NOT CODES. Every non-boilerplate export of every kernel module and of the shared math module is collected
// here; a SCREAMING_SNAKE name in a volume that is one of them is the module's public API, which the volumes are REQUIRED to
// name (tests/audit-doc-api-coverage.test.mjs enforces that). The set is derived, not listed, so it cannot go stale, and the
// count assertion below keeps it from being empty.
const apiNames = new Set()
{
  const files = [join(VMU, 'math-computation.js')]
  for (const d of ['kernel', 'kernel/prompt']) {
    try {
      for (const e of readdirSync(join(VMU, d), { withFileTypes: true })) if (e.name.endsWith('.js')) files.push(join(VMU, d, e.name))
    } catch { /* an optional directory */ }
  }
  for (const f of files) {
    let src = ''
    try { src = readFileSync(f, 'utf8') } catch { continue }
    for (const m of src.matchAll(/^export (?:function|const) ([A-Z][A-Z0-9_]{2,})/gm)) apiNames.add(m[1])
  }
}
ok(apiNames.size >= 20, 'the public API names are read from the modules, so the exemption below rests on derived data', { apiNames: apiNames.size })

// ENV SEAMS ARE NOT CODES. The `MATH_*` token namespace is shared by the shared module's refusal codes and by
// the env seams that point a dev-checkout guard at an out-of-repo asset (`MATH_CANON_DIR`, `MATH_SCHEMA_FILE`,
// registered in 11-§8 so a reader knows they only feed the canonical comparison - unset by default, in which
// case that guard reports a NAMED SKIP). Naming those seams used to be reported as "an unregistered error
// code". The exemption is DERIVED, not listed - a name is an env seam when the repository's own code READS it
// (`process.env.<NAME>`) - so it cannot go stale and a new seam is exempt the moment it is used. The set is
// asserted non-empty AND asserted to be load-bearing (each exempted name really is named by a volume), so the
// exemption cannot quietly become a dumping ground.
const envSeams = new Set()
{
  const walkEnv = (rel) => {
    let ents = []
    try { ents = readdirSync(join(REPO, rel), { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      if (e.name === 'node_modules' || e.name === '.git') continue
      const p = rel + '/' + e.name
      if (e.isDirectory()) { walkEnv(p); continue }
      if (!/\.(mjs|js|cjs)$/.test(e.name)) continue
      let src = ''
      try { src = readFileSync(join(REPO, p), 'utf8') } catch { continue }
      for (const m of src.matchAll(/process\.env\.((?:VMU|MATH|ARCHIVE|SCRIPT)_[A-Z0-9_]{3,})/g)) envSeams.add(m[1])
    }
  }
  for (const rel of ['tests', 'scripts', 'vibe-math-vmu']) walkEnv(rel)
}
ok(envSeams.size > 0 && envSeams.has('MATH_CANON_DIR') && envSeams.has('MATH_SCHEMA_FILE'),
  'the env seams a volume names are DERIVED from the code that reads them (process.env.<NAME>)',
  [...envSeams].sort().join(','))

const unregisteredInDocs = [...codeUse.entries()]
  .filter(([code]) => !registered.has(code) && !apiNames.has(code) && !envSeams.has(code))
  .map(([code, docs]) => code + ' (' + [...docs].join(',') + ')')
ok(unregisteredInDocs.length === 0,
  'every VMU_* code used in the docs is registered in 03-§8 (a module export, or a name the code reads from process.env, is exempt: see the derived env-seam set above)',
  unregisteredInDocs.slice(0, 8).join(' | '))
const exemptedInDocs = [...codeUse.keys()].filter((c) => envSeams.has(c) && !registered.has(c) && !apiNames.has(c))
ok(exemptedInDocs.length > 0,
  'the env-seam exemption is LOAD-BEARING (a documented seam really is exempted, so the branch above is exercised)',
  JSON.stringify(exemptedInDocs.sort()))

// ---- C. codes used in the CODE are registered too -------------------------------------------------
const codeFiles = []
const walk = (dir, depth) => {
  if (depth > 3) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const p = join(dir, entry.name)
    if (entry.isDirectory()) { if (entry.name !== 'docs') walk(p, depth + 1) }
    else if (entry.name.endsWith('.js')) codeFiles.push(p)
  }
}
walk(VMU, 0)
ok(codeFiles.length >= 12, 'the vmu runtime modules were found for the code audit', codeFiles.length)
const codeCodes = new Map()
for (const file of codeFiles) {
  const text = readFileSync(file, 'utf8')
  // Only string literals that look like a code: quoted, or a `code:` field value. SHARED-MODULE prefixes are
  // included, so a new `MATH_*`/`ARCHIVE_*`/`SCRIPT_*` code the code can throw must be registered too.
  for (const m of text.matchAll(CODE_LITERAL_RE)) {
    if (!codeCodes.has(m[1])) codeCodes.set(m[1], new Set())
    codeCodes.get(m[1]).add(file.replace(VMU + '\\', '').replace(VMU + '/', ''))
  }
}
const unregisteredInCode = [...codeCodes.entries()]
  .filter(([code]) => !registered.has(code) && !code.startsWith('VMU_PACK_') && !isPlaceholder(code))
  .map(([code, files]) => code + ' (' + [...files].slice(0, 2).join(',') + ')')
ok(unregisteredInCode.length === 0,
  'every framework VMU_* code the CODE can throw is registered in 03-§8 (pack codes are namespaced)',
  unregisteredInCode.slice(0, 8).join(' | '))
{
  const packish = [...codeCodes.keys()].filter((c) => c.startsWith('VMU_PACK_') && !isPlaceholder(c))
  ok(packish.length > 0 && packish.every((c) => /^VMU_PACK_[A-Z0-9_]+$/.test(c)),
    'pack codes keep the VMU_PACK_<ID>_<REASON> shape (R-d)', packish.join(','))
}

// ---- D. docs 03 §2.1 rows vs the public surfaces the modules expose ------------------------------
{
  // The PUBLISHED services only (docs/03 §2 table ①). The bus is an internal handle, not a published
  // service, so it is not parity-checked here - and `vmu.prompt` is singular, which is what the code says.
  const MODULES = {
    'vmu.library': 'kernel/library.js',
    'vmu.members': 'kernel/members.js',
    'vmu.tasks': 'kernel/tasks.js',
    'vmu.store': 'kernel/store.js',
    'vmu.prompt': 'kernel/prompt/index.js',
    'vmu.middleware': 'kernel/bus.js',
    'vmu.work': 'kernel/work.js',
  }
  const publicKeys = (src) => {
    const SKIP = ['if', 'for', 'while', 'return', 'const', 'let', 'switch', 'try', 'catch', 'function']
    const blocks = []
    const OPENER = /(?:return |(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*)\{/g
    let hit
    while ((hit = OPENER.exec(src)) !== null) {
      const i = hit.index + hit[0].length - 1
      let depth = 0, j = i, end = -1
      const start = i + 1
      for (; j < src.length; j++) {
        if (src[j] === '{') depth++
        else if (src[j] === '}') { depth--; if (depth === 0) { end = j; break } }
      }
      if (end === -1) continue
      const keys = new Set()
      let methods = 0
      let d = 0
      for (const line of src.slice(start, end).split('\n')) {
        if (d === 0) {
          const t = line.trim()
          const m = /^(?:async\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*[(,:]/.exec(t)
          if (m && !SKIP.includes(m[1])) keys.add(m[1])
          if (/^(?:async\s+)?[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{/.test(t)) methods++
        }
        d += (line.match(/[{([]/g) || []).length - (line.match(/[})\]]/g) || []).length
      }
      blocks.push({ keys, methods })
    }
    blocks.sort((a, b) => (b.methods - a.methods) || (b.keys.size - a.keys.size))
    return (blocks[0] && blocks[0].keys) || new Set()
  }
  const GLOBAL_SKIP = ['status', 'ok', 'root', 'file', 'dir']
  for (const [svc, rel] of Object.entries(MODULES)) {
    const rows = [...contract.matchAll(new RegExp('^\\| `' + svc.replace('.', '\\.') + '`.*$', 'gm'))]
    ok(rows.length > 0, 'contract row exists for ' + svc, 'missing')
    if (rows.length === 0) continue
    // The row that DOCUMENTS methods is the row that documents methods. The generated service index also has one row per
    // service, with a purpose and no method list, so picking by position would make every method look omitted.
    const row = rows.map((r) => r[0]).sort((a, b) => (b.match(/\(/g) || []).length - (a.match(/\(/g) || []).length)[0]
    const impl = publicKeys(readFileSync(join(VMU, rel), 'utf8'))
    const DOC_SKIP = ['async', 'await', 'if', 'for', 'while', 'return', 'function', 'new', 'typeof']
    const documented = new Set([...row.matchAll(/`?([a-zA-Z][a-zA-Z0-9]*)\(/g)].map((m) => m[1]).filter((n) => !DOC_SKIP.includes(n)))
    const docOnly = [...documented].filter((d) => !impl.has(d))
    const implOnly = [...impl].filter((i) => !documented.has(i) && !GLOBAL_SKIP.includes(i))
    ok(docOnly.length === 0, svc + ': the contract does not document methods the module lacks', docOnly.join(','))
    ok(implOnly.length === 0, svc + ': the module does not expose methods the contract omits', implOnly.join(','))
  }
}

// ---- E. the docs that must state their open questions do -----------------------------------------
{
  // Derived from the DISCOVERED docs (a hard-coded list of names drifted the moment it was written).
  const NEEDS_OPEN = DOC_FILES.filter((name) => /^(02|03|08|12)-/.test(name))
  const missing = NEEDS_OPEN.filter((name) => !/未核项/.test(docText.get(name) || ''))
  ok(NEEDS_OPEN.length >= 3, 'the docs that must state open questions were found', NEEDS_OPEN.join(','))
  ok(missing.length === 0, 'every doc that must declare its open questions has a 未核项 section', missing.join(','))
}

// ---- F. the TOOL surface: what the docs name vs what the host registers ---------------------------
// The doc set is the interface contract, so a tool the manual tells a reader to call must exist - or the
// line that names it must SAY it does not exist yet. Twelve phantom tool names (`vibe_vmu_mw`,
// `vibe_vmu_pack`, ...) shipped in the manuals as if they were callable, and no gate noticed.
{
  const hostSrc = readFileSync(join(VMU, 'host.js'), 'utf8')
  const from = hostSrc.indexOf('export const TOOL_NAMES')
  const block = hostSrc.slice(from, hostSrc.indexOf('})', from))
  const implemented = new Set([...block.matchAll(/'(vibe_vmu_[a-z_]+)'/g)].map((m) => m[1]))
  ok(implemented.size === Object.keys(TOOL_NAMES).length, 'the parse out of host.js equals the imported TOOL_NAMES exactly, so a narrowing parse cannot pass', [...implemented].join(','))

  const documented = new Map()
  for (const [name, text] of docText) {
    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/\b(vibe_vmu_[a-z_]+)\b/g)) {
        if (!documented.has(m[1])) documented.set(m[1], [])
        documented.get(m[1]).push({ doc: name, line: i + 1, text: line })
      }
    })
  }
  const missingInContract = [...implemented].filter((t) => !contract.includes('`' + t + '`'))
  ok(missingInContract.length === 0, 'every tool the host registers is registered in 03-§3', missingInContract.join(','))

  // `计划` is included deliberately: it is the natural Chinese word for "planned", and a volume that writes
  // "（计划）" IS marking the tool as not-yet-registered. The audit's job is that the reader is told, not that a
  // particular word is used; the volumes also use 规划/未实现/⛔ (docs/00 §4 fixes the vocabulary).
  const MARKERS = /未实现|未接线|规划|计划|提案|roadmap|⛔|待实现|目标形态|尚未/
  const unmarked = []
  for (const [name, hits] of documented) {
    if (implemented.has(name)) continue
    if (!hits.some((h) => MARKERS.test(h.text))) {
      unmarked.push(name + ' (' + hits[0].doc + ':' + hits[0].line + ')')
    }
  }
  ok(unmarked.length === 0,
    'every documented tool the host does NOT register is marked as unimplemented on the line that names it',
    unmarked.slice(0, 10).join(' | '))
}

// ---- G. the SETTINGS surface: documented keys must exist, and the wired column must be honest -----
{
  const { SETTING_DEFS } = await import(pathToFileURL(join(VMU, 'settings', 'schema.js')).href)
  const keys = new Set(SETTING_DEFS.map((d) => d.key))
  // ★ THE REAL SOURCES OF THIS CRITERION (round 14, MEASURED - the table docs/11 §4.2 quotes):
  //   ① `SETTING_DEFS` (settings/schema.js = core + PLANNED_DEFS): a name that IS a declared key is not bogus.
  //   ② `NON_SETTING`: a HAND-WRITTEN table of service/registry names dotted like keys. IMPORTED, not copied (see the
  //      import). It is LOAD-BEARING IN THE GENERATOR and that is measured, not assumed: deleting its ten
  //      ROUND-108/ROUND-270 names makes the generator re-mint 9 planned keys (`--check` STALE, 123 vs 114), because
  //      the generator has NO call-form rule - this audit does. So the call-form rule does NOT let that table shrink;
  //      what it does is stop the table GROWING every time a method is mentioned.
  //   ③ two MECHANICAL rules, which is where that growth came from:
  //      · a FAMILY mention (`vmu.x.y.*`) is prose about a family, not a claim about `vmu.x.y`;
  //      · a CALL (`vmu.x.y(`) is a method invocation - nobody can SET a method, so the name is not a key.
  //   ④ plus the two-stage forgiveness below: a name that is the PREFIX of another documented name is a namespace.
  // ★ NOT a source, MEASURED: `namespaces` cannot fire (its values are two-segment, the key regex demands three). It
  //   stays in the filter and is asserted unreachable (self-probe ⑤b) rather than quietly relied on as a third source.
  const namespaces = new Set([...keys].map((k) => k.split('.').slice(0, 2).join('.')))
  const bogus = new Set()
  for (const [name, text] of docText) {
    // ROUND 224: the open-items ledger is a CHANGELOG. It quotes key names while narrating work, so it neither declares
    // keys nor obliges anyone to register the names it mentions (it quotes `vmu.x.y` from another file's comment). The
    // generator excludes it as a source for the same reason; the two must agree.
    if (LEDGER_PREFIXES.some((p) => name.startsWith(p))) continue
    for (const m of text.matchAll(/\bvmu\.[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+\b(?!\s*\()/g)) {
      const k = m[0]
      // A FAMILY wildcard (`vmu.math.lean*`) is prose about a family, not a claim about a key.
      const after = text.slice(m.index + k.length, m.index + k.length + 1)
      if (after === '*' || after === '…') continue
      if (keys.has(k) || NON_SETTING.has(k) || namespaces.has(k)) continue
      // ROUND 224: a FAMILY mention is not a key. This set is built before any filtering, so the rule must be applied
      // here: the key regex stops at a word boundary and `vmu.x.y.*` matches as `vmu.x.y`.
      const afterTxt = text.slice(m.index + m[0].length, m.index + m[0].length + 3)
      const oneTxt = text.slice(m.index + m[0].length, m.index + m[0].length + 1)
      if (oneTxt === '*' || oneTxt === '…' || /^\.\s*[*…]/.test(afterTxt)) continue
      bogus.add(k + ' (' + name + ')')
    }
  }
  // ROUND 99: same rule and same set as the planned gate, but this file imports the file helpers rather than
  // `docVolumes` - calling that helper here is what made an earlier attempt throw a ReferenceError instead of
  // failing an assertion, which is a much worse way to learn that a name is missing.
  {
    const documented = new Set()
    // ROUND 100: reuse the text this gate ALREADY loaded through its binding. Reading the files directly here
    // bypassed the binding the mutation suite injects, so all fourteen mutants failed with a readdir error
    // instead of testing what they were written to test - a green audit and a fully red mutant suite.
    for (const [name, text] of docText) {
      // ROUND 224: the open-items ledger is a changelog - it quotes key names while narrating work, so it neither declares
      // keys nor creates an obligation to register the names it mentions (`vmu.x.y` comes from the generator's comments).
      if (LEDGER_PREFIXES.some((p) => name.startsWith(p))) continue
      for (const m of text.matchAll(/\bvmu\.[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+\b(?!\s*\()/g)) {
        // ROUND 224: a FAMILY mention is not a key. The key regex stops at a word boundary, so `vmu.x.y.*` matches as
        // `vmu.x.y`; the lookahead must be taken in the TEXT, not inside the collected-name set (which holds bare names
        // only, so a `k + '.*'` prefix test there could never match - the first attempt at this proved it).
        const after = text.slice(m.index + m[0].length, m.index + m[0].length + 3)
        const one = text.slice(m.index + m[0].length, m.index + m[0].length + 1)
        if (one === '*' || one === '…' || /^\.\s*[*…]/.test(after)) continue
        documented.add(m[0])
      }
    }
    for (const entry of [...bogus]) {
      const k = entry.split(" (")[0]
      // ROUND 224: a name is not a key when another key lives under it (a namespace), and a FAMILY mention is not a key
      // either. The generator has applied both rules for a while; this scanner applied neither, so `vmu.math.proof.*`
      // (written with a wildcard in the design volume) was reported as a key that does not exist.
      if ([...documented].some((o) => o !== k && o.startsWith(k + "."))) { bogus.delete(entry); continue }
      if ([...documented].some((o) => o !== k && o.startsWith(k + ".*") )) { bogus.delete(entry); continue }
    }
  }
  ok(bogus.size === 0, 'every vmu.* key named in the docs exists in settings/schema.js', [...bogus].slice(0, 8).join(' | '))

  // ROUND 13 / task-101 ③: self-probes on the criterion ITSELF (synthetic samples, so they do not depend on
  // any volume's content). ORDER = old exemptions FIRST, new one LAST (docs/11 §4.2 第九条: exemptions cover for
  // each other, so a new exemption must be landed without disturbing the existing ones).
  {
    const DOTTED = /\bvmu\.[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+\b(?!\s*\()/g
    // The probe must exercise the SAME pattern the two collection sites use - if one drifts, this reddens.
    const src = readFileSync(fileURLToPath(import.meta.url), 'utf8')
    const literalCount = (src.match(/\?:\\.\[a-zA-Z0-9\]\+\)\+\\b\(\?!\\s\*\\\(\)/g) || []).length
    ok(literalCount === 3,
      '★ the call-form pattern is IDENTICAL in the three places that need it (two collection sites + this probe), so the criterion cannot drift between them',
      { found: literalCount })
    // ROUND 14: the probe runs the REAL two-stage criterion, not a one-stage replica of it. The replica forgave a name
    // because `keys`/`NON_SETTING`/`namespaces` held it, while the gate ALSO forgives a namespace PARENT in stage 2 -
    // so self-probe ② passed on a sample that happened to BE a real key and never touched the rule it was named after.
    const bogusOf = (sample) => {
      const out = new Set()
      const stage1 = []
      for (const m of sample.matchAll(DOTTED)) {
        const k = m[0]
        const after = sample.slice(m.index + k.length, m.index + k.length + 1)
        if (after === '*' || after === '…') continue
        if (keys.has(k) || NON_SETTING.has(k) || namespaces.has(k)) continue
        if (/^\.\s*[*…]/.test(sample.slice(m.index + k.length, m.index + k.length + 3))) continue
        stage1.push(k)
      }
      const documented = new Set([...sample.matchAll(DOTTED)].map((m) => m[0]))
      for (const k of stage1) {
        if ([...documented].some((o) => o !== k && (o.startsWith(k + '.') || o.startsWith(k + '.*')))) continue
        out.add(k)
      }
      return [...out]
    }
    // ① an EXISTING exemption: a family/wildcard mention is still prose, not a key.
    ok(bogusOf('see `vmu.math.lean.family*` for the family').length === 0,
      '★ SELF-PROBE ① (old exemption intact): a FAMILY/wildcard mention is still not reported')
    // ② an EXISTING exemption: the namespace PARENT is forgiven while its CHILD is still judged. The sample name is
    // deliberately NOT a key (the old sample, `vmu.meetings.open`, IS one - which is why this probe proved the key rule).
    {
      const two = bogusOf('write `vmu.probe.ns` and `vmu.probe.ns.child` in the volume')
      ok(two.length === 1 && two[0] === 'vmu.probe.ns.child',
        '★ SELF-PROBE ② (old exemption intact): a NAMESPACE parent is forgiven by the documented-child rule, and its child is still reported',
        two.join(','))
    }
    // ③ the NEW exemption: a CALL is not a setting. The name is SYNTHETIC on purpose: `vmu.tasks.status` was real
    // enough to become a planned key later, which would silently turn this probe into a second key-exemption probe.
    ok(bogusOf('call `vmu.probe.call()` to read the board').length === 0,
      '★ SELF-PROBE ③ (new exemption): a CALL form (`vmu.probe.call()`) is NOT reported even though the name is not a key')
    // ④ the exemption must NOT have widened into "anything goes": the same name written as a KEY still reports.
    ok(bogusOf('set `vmu.probe.call` to true in your preset').length === 1,
      '★ SELF-PROBE ④ (teeth kept): the SAME name written as a key (no call) is STILL reported - the criterion is not "exists ⇒ pass"')
    // ⑤ the hand TABLE itself is audited (第九条: an exemption must be able to redden), and the claim about the third
    // source is measured rather than repeated: (a) no entry may be a REAL key - an entry that is a key is a stale
    // exemption, and that is exactly how this audit's own copy was caught (its `vmu.dissemination.*` pair had become
    // real keys); (b) `namespaces` cannot fire (two-segment values against a three-segment regex), so it is not a source.
    {
      const staleEntries = [...NON_SETTING].filter((n) => keys.has(n))
      ok(NON_SETTING.size > 0 && staleEntries.length === 0,
        '★ SELF-PROBE ⑤ (the hand table earns its entries): no NON_SETTING entry is a real setting key, so none is a stale exemption',
        staleEntries.join(',') + ' of ' + NON_SETTING.size)
      const threeSeg = [...namespaces].filter((n) => n.split('.').length !== 2)
      ok(namespaces.size > 0 && threeSeg.length === 0,
        '★ SELF-PROBE ⑤b (measured, not repeated): every `namespaces` value is two-segment, so the third forgiveness is the documented-child rule - this filter can never fire',
        threeSeg.join(','))
    }
  }

  // ---- G2. a PLANNED key may not rest on a CALL-shaped mention -------------------------------------
  // ROUND 14: the same key-vs-call confusion, one level up. A planned key exists because a design volume NAMED it; when
  // EVERY mention in the source volumes is a CALL, the name is a SERVICE SURFACE that the registry captured as a
  // setting. The row it produces says `planned:true, def:null`, so the settings table promises a knob that does not
  // exist and will not - which is the promise this whole audit exists to prevent. THREE names are known and NAMED
  // below: a FOURTH is a new defect, and one of the three DISAPPEARING is a repair that must delete its own line here.
  // (Called only as `vmu.meetings.open()` in two volumes, and as the call in docs/22 for the other two.)
  {
    const escaped = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const sourceVols = [...docText].filter(([n]) => !SETTINGS_MIRROR_PREFIXES.some((p) => n.startsWith(p))
      && !LEDGER_PREFIXES.some((p) => n.startsWith(p)))
    const callOnlyPlanned = (vols, list) => list.filter((k) => {
      let bare = 0, calls = 0
      for (const [, t] of vols) {
        for (const m of t.matchAll(new RegExp('\\b' + escaped(k) + '(?![a-zA-Z0-9_.])', 'g'))) {
          if (/^\s*\(/.test(t.slice(m.index + k.length))) calls += 1
          else bare += 1
        }
      }
      return bare === 0 && calls > 0
    })
    const plannedKeys = SETTING_DEFS.filter((d) => d.planned === true).map((d) => d.key)
    const callOnly = callOnlyPlanned(sourceVols, plannedKeys).sort()
    // ROUND 14: the three names that lived here (`vmu.dissemination.impact`, `vmu.dissemination.mediaRequest`,
    // `vmu.meetings.open`) were REPAIRED, not merely pardoned: the generator's collector
    // (`scripts/generate-planned-settings.mjs`) now carries the same "a dotted name immediately followed by `(` is a
    // CALL, not a setting" rule this audit landed in round 13, so those three stopped being planned keys at all
    // (planned 114 -> 111) and the settings table no longer promises knobs that do not exist. This ledger is
    // therefore EMPTY - and that is the point: it is a named list of KNOWN defects, so a repair deletes its line.
    // A fourth name appearing here is a NEW defect.
    const KNOWN_CALL_ONLY = []
    ok(sourceVols.length > 0 && plannedKeys.length > 0,
      'non-vacuous: the source volumes and the planned registry are both there to compare',
      { volumes: sourceVols.length, plannedKeys: plannedKeys.length })
    ok(callOnly.length === KNOWN_CALL_ONLY.length && callOnly.join('|') === KNOWN_CALL_ONLY.slice().sort().join('|'),
      '★ no planned key rests ONLY on a CALL-shaped mention (today: exactly the three NAMED service surfaces - a fourth is a new defect, a repair deletes its line here)',
      callOnly.join(','))
    // The predicate is exercised on a SYNTHETIC volume set, so the ledger cannot be satisfied by an empty scan.
    // Two SEPARATE one-line sets: putting the bare mention in the same set would make the call-only case impossible.
    const synthCall = [['x', 'call `vmu.probe.only()` here']]
    const synthBare = [['x', 'set `vmu.probe.real` to 1']]
    ok(callOnlyPlanned(synthCall, ['vmu.probe.only']).length === 1,
      '★ SELF-PROBE (G2): a key mentioned ONLY in call form IS caught by this predicate')
    ok(callOnlyPlanned(synthBare, ['vmu.probe.real']).length === 0,
      '★ SELF-PROBE (G2): and the same predicate stays quiet for a key that is mentioned as a KEY')
  }

  const settingsDoc = docText.get(DOC_FILES.find((n) => /^04-/.test(n))) || ''
  // Concrete key rows only: the table also carries namespace PATTERN rows (`vmu.core.*`) which describe a
  // family rather than a key, so they neither need a wired marker nor count towards the key total.
  const rows = settingsDoc.split('\n').filter((l) => /^\| `vmu\.[a-zA-Z0-9.]+`/.test(l))
  ok(rows.length > 0 && SETTING_DEFS.length > 0, '04 §11 really has key rows and the registry really declares keys (non-vacuous comparison)',
    rows.length + ' rows / ' + SETTING_DEFS.length + ' declared')
  ok(rows.length - SETTING_DEFS.length === 0, '04 §11 has exactly one row per declared key', rows.length + '/' + SETTING_DEFS.length)
  const unmarkedRows = rows.filter((r) => !/已接线|未接线/.test(r))
  ok(unmarkedRows.length === 0, 'every settings row states whether the key is WIRED (no silent promises)',
    unmarkedRows.slice(0, 3).map((r) => (r.split('|')[1] || '').trim()).join(','))

  // Independently recompute the wired set: a key is wired when its literal appears in the runtime sources.
  const runtimeFiles = ['vibe-math-vmu.js', 'host.js', 'host-hooks.js', 'host-spawn.js'].map((f) => join(VMU, f))
  const walkRuntime = (dir, depth) => {
    if (depth > 3 || !existsSync(dir)) return
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', 'docs', 'settings'].includes(e.name)) continue
      const p = join(dir, e.name)
      if (e.isDirectory()) walkRuntime(p, depth + 1)
      else if (e.name.endsWith('.js') && !['math-computation.js', 'math-engines.js'].includes(e.name)) runtimeFiles.push(p)
    }
  }
  walkRuntime(VMU, 0)
  // ROUND 195: THE SAME RULE AS THE GENERATOR (one rule, one place). Counting any quoted literal let a key's own
  // declaration table count as a reader, so `planned` rows could claim 已接线 and this audit could not see it. Note the
  // consequence, stated deliberately: the rule is evaluated against the REAL repository, not the copied code dir, so a
  // mutant that changed wiring by editing CODE would not be seen - the wiring mutants here are all docs-side.
  const trulyUnwired = new Set(SETTING_DEFS.filter((d) => !hasConsumer(d.key)).map((d) => d.key))
  const claimedUnwired = new Set(rows.filter((r) => /未接线/.test(r))
    .map((r) => ((r.match(/`(vmu\.[a-zA-Z0-9.]+)`/) || [])[1])).filter(Boolean))
  const claimedWired = new Set(rows.filter((r) => /已接线/.test(r))
    .map((r) => ((r.match(/`(vmu\.[a-zA-Z0-9.]+)`/) || [])[1])).filter(Boolean))
  const lyingWired = [...claimedWired].filter((k) => trulyUnwired.has(k))
  const lyingUnwired = [...claimedUnwired].filter((k) => !trulyUnwired.has(k))
  ok(lyingWired.length === 0, 'no key is claimed WIRED while no runtime source reads it', lyingWired.slice(0, 8).join(','))
  ok(lyingUnwired.length === 0, 'no key is marked unwired although a runtime source reads it', lyingUnwired.slice(0, 8).join(','))
  ok(claimedUnwired.size > 0, 'the doc set admits which keys are declared-but-not-wired (today: ' + claimedUnwired.size + ')')
}

// ---- H. the real WIRING surface is documented ----------------------------------------------------
// The shipped plugin is configured with `config.packs` / `config.modules` / `config.scripts` on its profile
// row. None of those appeared anywhere in the docs, so no reader could actually install a pack or a module.
{
  const all = [...docText.values()].join('\n')
  const missing = ['config.packs', 'config.modules', 'config.scripts'].filter((k) => !all.includes(k))
  ok(missing.length === 0, 'the docs state the real wiring surface (config.packs / config.modules / config.scripts)',
    missing.join(','))
}

// ---- I. every registered vmu hook is EMITTED or explicitly declared as not-yet-emitted -----------------
// A registered hook with no producer is a挂点 that silently never fires - exactly the failure mode docs/02
// §2 used to hide (it listed hook domains that nothing emits). The check is two-sided on purpose: a hook
// that has no producer must be declared, AND a declared hook that HAS gained a producer must leave the list.
{
  // D-12: read the runtime EXPORT (bus.js derives VU_HOOKS from HOOK_REGISTRY now); a source-text slice would
  // be coupled to the derivation's shape rather than to the hook vocabulary it publishes.
  const { VU_HOOKS } = await import('../vibe-math-vmu/kernel/bus.js')
  const registered = [...new Set(VU_HOOKS)]
  ok(registered.length >= 15, 'the registered vmu hooks were read from the runtime export, not sliced out of the source', registered.length)

  const emitted = new Set()
  const kernelFiles = [join(VMU, 'vibe-math-vmu.js'), join(VMU, 'host-hooks.js')]
  for (const dir of ['kernel', 'packs']) {
    const abs = join(VMU, dir)
    if (!existsSync(abs)) continue
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        for (const sub of readdirSync(join(abs, entry.name), { withFileTypes: true })) {
          if (sub.name.endsWith('.js')) kernelFiles.push(join(abs, entry.name, sub.name))
        }
      } else if (entry.name.endsWith('.js') && entry.name !== 'bus.js') kernelFiles.push(join(abs, entry.name))
    }
  }
  // PRODUCER SHAPES (handover round 2, measured) - the scan must accept the shapes the code REALLY uses, and
  // EACH shape must be PROVEN to reach the bus, so this cannot be loosened into "naming the hook is enough":
  //   (a) `.bus.emit('NAME', …)`                                  - direct (incl. `o.bus.emit('NAME'`)
  //   (b) a LOCAL helper named emit/publish whose body calls `.bus.emit(` - then its call sites count:
  //         `emit('NAME', …)` AND `emit({ name: 'NAME', … })`
  //   (c) a LOCAL `say` helper whose body calls `.bus.emit(`       - then `say({ type: 'NAME', … })`
  // The lookbehind `(?<![.\w])` keeps `bus.emit(`/`o.bus.emit(`/`_vmu_emit(` out of the call-site collection, so
  // a chained call and a Python helper name inside a template string can never be mistaken for a producer.
  let helperFiles = 0
  // ROUND 13 / task-98 B (Lead, verify's `task-98`): the previous rule was a CHARACTER WINDOW
  // (`[\s\S]{0,700}?bus\.emit\(`). It is brittle in the direction that matters: a long comment inside the
  // helper body pushes `.bus.emit(` past 700 characters and a REAL producer reads as dead - measured on
  // `kernel/ballotbox.js` (distance 856 after one added line), which made six registered hooks look unemitted.
  // The window is replaced by a FUNCTION-BODY match: braced bodies are brace-matched; a concise arrow body
  // (`=> bus.emit(…)`) runs to the end of its statement. A gutted helper still reaches nothing (see the probe).
  const helperReachesBus = (s) => {
    const re = /(?:const|let|var|function)\s+(?:emit|publish|say)\s*[=(]/g
    let m
    while ((m = re.exec(s)) !== null) {
      const rest = s.slice(m.index)
      const brace = rest.indexOf('{')
      const arrow = rest.indexOf('=>')
      if (arrow >= 0 && (brace < 0 || brace > arrow + 2)) {
        const stop = rest.indexOf(';', arrow)
        const body = stop < 0 ? rest.slice(0, 4000) : rest.slice(0, stop + 1)
        if (/\bbus\.emit\(/.test(body)) return true
        continue
      }
      if (brace < 0) continue
      let depth = 0
      for (let i = brace; i < rest.length; i += 1) {
        if (rest[i] === '{') depth += 1
        else if (rest[i] === '}') {
          depth -= 1
          if (depth === 0) {
            if (/\bbus\.emit\(/.test(rest.slice(brace, i + 1))) return true
            break
          }
        }
      }
    }
    return false
  }
  ok(kernelFiles.length > 0,
    'the producer scan has files to scan (a non-empty file set is what makes the collection below meaningful)',
    String(kernelFiles.length))
  for (const file of kernelFiles) {
    const src = readFileSync(file, 'utf8')
    // EMPTY_ALLOWED: 有些 kernel 文件本来就不发起 bus 事件（本扫描是"收集全体发射者"），空集即合规；
    // 全体规模由后面的 `emitted.size >= 10`（以及 `helperFiles > 0`）把关，不会被空集掩盖。
    for (const m of src.matchAll(/\bbus\.emit\(\s*['"]([^'"]+)['"]/g)) emitted.add(m[1])   // EMPTY_ALLOWED: 单文件可零直接发射；
    const helperReachesBusHere = helperReachesBus(src)
    if (!helperReachesBusHere) continue
    helperFiles += 1
    for (const m of src.matchAll(/(?<![.\w])emit\(\s*['"]([^'"]+)['"]/g)) emitted.add(m[1])   // EMPTY_ALLOWED: 该文件可以没有位置参调用点；
    for (const m of src.matchAll(/(?<![.\w])emit\(\s*\{\s*name:\s*['"]([^'"]+)['"]/g)) emitted.add(m[1])   // EMPTY_ALLOWED: 同上（对象参变体）；
    for (const m of src.matchAll(/(?<![.\w])say\(\s*\{\s*type:\s*['"]([^'"]+)['"]/g)) emitted.add(m[1])   // EMPTY_ALLOWED: 该文件可以不用 say 通道；
  }
  ok(helperFiles > 0,
    '★ the scan really exercised at least one LOCAL emit/say helper shape, so the (b)/(c) acceptance is load-bearing rather than dead code',
    String(helperFiles) + ' file(s)')
  // SELF-PROBE: the helper acceptance must be falsifiable - a helper that does NOT call the bus contributes NOTHING.
  {
    const reaches = helperReachesBus
    const names = (s) => {
      const out = []
      // EMPTY_ALLOWED: this helper is deliberately GENERIC (it is run on both a gutted and a real fixture), so an
      // empty result is legitimate for one of its inputs - and the probe's own assertion right below pins the exact
      // expected sizes (`names(real)` contains 'real/hook', `names(gutted).length === 2`), so nothing is hidden.
      for (const m of s.matchAll(/(?<![.\w])emit\(\s*['"]([^'"]+)['"]/g)) out.push(m[1])   // EMPTY_ALLOWED: 见上（同一助手跑两种夹具）；
      for (const m of s.matchAll(/(?<![.\w])emit\(\s*\{\s*name:\s*['"]([^'"]+)['"]/g)) out.push(m[1])   // EMPTY_ALLOWED: 对象参变体，同上；
      for (const m of s.matchAll(/(?<![.\w])say\(\s*\{\s*type:\s*['"]([^'"]+)['"]/g)) out.push(m[1])   // EMPTY_ALLOWED: say 通道，同上；
      return out
    }
    const gutted = 'const emit = (n) => { log(n); return null }\nemit("fake/hook", {})\nconst say = (e) => log(e)\nsay({ type: "fake/other" })'
    const real = 'const emit = (n) => bus.emit(n, {})\nemit("real/hook", {})'
    // ROUND 13: the brittleness that this rule replaced. A braced body whose `bus.emit(` sits MORE than 700
    // characters in (because a long comment precedes it) is a REAL producer and must still be accepted.
    const longBody = 'const emit = (n) => {\n' + '  // ' + 'x'.repeat(800) + '\n  bus.emit(n, {})\n}'
    ok(!reaches(gutted) && reaches(real) && reaches(longBody) && names(real).includes('real/hook') && names(gutted).length === 2,
      '★ SELF-PROBE: a local emit/say helper that does NOT call the bus is NOT accepted, one that does contributes its literals, and a LONG braced body (>700 chars before bus.emit) is still accepted',
      JSON.stringify({ guttedReaches: reaches(gutted), realReaches: reaches(real), longBodyReaches: reaches(longBody), realNames: names(real) }))
  }
  ok(emitted.size >= 10, 'the emitter scan found the real producers', [...emitted].sort().join(','))

  // Declared gaps: registered, no producer yet. Keeping this list HONEST is the point (docs/05 §4.3).
  // Two hooks have LEFT this list in this session, each the moment a real producer appeared: the drifted
  // `prompt/assemble` was replaced by the frozen `prompt/section-assembled`, and `budget/exceeded` gained a
  // producer in kernel/fairness.js (the doc-side row in 05 was corrected in the same change).
  // `record/appended` LEFT this list in round 32: kernel/compliance.js:89 really emits it (so do domaingate,
  // handover and minutes), which made this list stale - and a stale exemption is exactly the kind of "the checker
  // stopped seeing it" state this suite exists to catch. Removing it TIGHTENS the audit.
  //
  // ROUND 496: the last four LEFT it too, all at once, because a scan of the OTHER direction (is every EMITTED name
  // frozen?) found the reverse defect as well: budget/warn and member/self-report were emitted inside VMU's namespace
  // without being frozen, so the bus refused them and two live paths threw. Fixing that led to producers for all four of
  // these, at the points where intervention is still possible. The list is now EMPTY, which is the state it should reach -
  // and an empty set makes the assertion below stricter, not weaker: any registered hook without a producer now fails.
  const KNOWN_UNEMITTED = new Set([])
  const missing = registered.filter((h) => !emitted.has(h) && !KNOWN_UNEMITTED.has(h))
  ok(missing.length === 0,
    'every registered vmu hook is either EMITTED or explicitly listed as not-yet-emitted',
    missing.join(','))
  const stale = [...KNOWN_UNEMITTED].filter((h) => emitted.has(h))
  ok(stale.length === 0,
    'and the not-yet-emitted list does not hide hooks that already gained a producer', stale.join(','))
}

const out = '=== VMU DOCS AUDIT: ' + passed + ' passed, ' + failed + ' failed ==='
console.log(out)
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
