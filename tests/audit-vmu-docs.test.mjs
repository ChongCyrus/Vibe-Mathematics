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

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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
ok(DOC_FILES.length === 15, 'the design set is exactly 15 docs (00..14)', DOC_FILES.join(','))

// ---- A. the design set exists and is non-trivial -------------------------------------------------
const docText = new Map()
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
  for (const m of row[1].matchAll(/`(VMU_[A-Z0-9_]+)`/g)) registered.add(m[1])
}
ok(registered.size >= 15, 'the error-code table registers a substantial set', registered.size)
const isPlaceholder = (code) => code.endsWith('_') || code.includes('PACKID') || code.includes('REASON')
const codeUse = new Map()
for (const [name, text] of docText) {
  for (const m of text.matchAll(/\b(VMU_[A-Z0-9_]{3,})\b/g)) {
    const code = m[1]
    if (isPlaceholder(code)) continue
    if (!codeUse.has(code)) codeUse.set(code, new Set())
    codeUse.get(code).add(name)
  }
}
const unregisteredInDocs = [...codeUse.entries()]
  .filter(([code]) => !registered.has(code))
  .map(([code, docs]) => code + ' (' + [...docs].join(',') + ')')
ok(unregisteredInDocs.length === 0, 'every VMU_* code used in the docs is registered in 03-§8',
  unregisteredInDocs.slice(0, 8).join(' | '))

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
  // Only string literals that look like a code: quoted, or a `code:` field value.
  for (const m of text.matchAll(/['"`](VMU_[A-Z0-9_]{3,})['"`]/g)) {
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
  ok(packish.every((c) => /^VMU_PACK_[A-Z0-9_]+$/.test(c)),
    'pack codes keep the VMU_PACK_<ID>_<REASON> shape (R-d)', packish.join(','))
}

// ---- D. docs 03 §2.1 rows vs the public surfaces the modules expose ------------------------------
{
  const MODULES = {
    'vmu.library': 'kernel/library.js',
    'vmu.members': 'kernel/members.js',
    'vmu.store': 'kernel/store.js',
    'vmu.bus': 'kernel/bus.js',
    'vmu.prompts': 'kernel/prompt/index.js',
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
    if (rows.length === 0) { ok(false, 'contract row exists for ' + svc, 'missing'); continue }
    const row = rows[rows.length - 1][0]
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
  ok(implemented.size >= 5, 'TOOL_NAMES was read out of host.js', [...implemented].join(','))

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

  const MARKERS = /未实现|未接线|规划|提案|roadmap|⛔|待实现|目标形态|尚未/
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
  const namespaces = new Set([...keys].map((k) => k.split('.').slice(0, 2).join('.')))
  // Dotted names that are SERVICE/registry names or namespaces, not setting keys.
  const NON_SETTING = new Set(['vmu.prompt', 'vmu.library', 'vmu.members', 'vmu.tasks', 'vmu.store', 'vmu.bus',
    'vmu.kernel', 'vmu.settings', 'vmu.rules', 'vmu.bridge', 'vmu.loader', 'vmu.registry', 'vmu.meetings',
    'vmu.budget', 'vmu.packs', 'vmu.middleware', 'vmu.records', 'vmu.core', 'vmu.limits', 'vmu.safety',
    'vmu.math', 'vmu.ballot', 'vmu.meeting', 'vmu.schema', 'vmu.status'])
  const bogus = new Set()
  for (const [name, text] of docText) {
    for (const m of text.matchAll(/\bvmu\.[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+\b/g)) {
      const k = m[0]
      if (keys.has(k) || NON_SETTING.has(k) || namespaces.has(k)) continue
      bogus.add(k + ' (' + name + ')')
    }
  }
  ok(bogus.size === 0, 'every vmu.* key named in the docs exists in settings/schema.js', [...bogus].slice(0, 8).join(' | '))

  const settingsDoc = docText.get(DOC_FILES.find((n) => /^04-/.test(n))) || ''
  // Concrete key rows only: the table also carries namespace PATTERN rows (`vmu.core.*`) which describe a
  // family rather than a key, so they neither need a wired marker nor count towards the key total.
  const rows = settingsDoc.split('\n').filter((l) => /^\| `vmu\.[a-zA-Z0-9.]+`/.test(l))
  ok(rows.length === SETTING_DEFS.length, '04 §11 has exactly one row per declared key', rows.length + '/' + SETTING_DEFS.length)
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
  const runtimeText = runtimeFiles.filter((f) => existsSync(f)).map((f) => readFileSync(f, 'utf8')).join('\n')
  const trulyUnwired = new Set(SETTING_DEFS.filter((d) => !runtimeText.includes("'" + d.key + "'")).map((d) => d.key))
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

const out = '=== VMU DOCS AUDIT: ' + passed + ' passed, ' + failed + ' failed ==='
console.log(out)
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
