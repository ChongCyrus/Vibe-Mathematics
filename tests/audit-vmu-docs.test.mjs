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

const out = '=== VMU DOCS AUDIT: ' + passed + ' passed, ' + failed + ' failed ==='
console.log(out)
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
