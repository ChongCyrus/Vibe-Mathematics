// tests/audit-fs-purpose.test.mjs — Round 7 / task-50 B: F53's automatic gate.
//
// THE RULE (F53, until now documentation-only — core named the missing gate): a module that DIRECTLY touches the
// filesystem must say WHY in a comment, and the reason must be one of the three sanctioned kinds:
//   · guard      — the guard itself, which must read the filesystem to DECIDE something
//   · audit      — the framework's own audit anchors / logs / own artifacts
//   · self-audit — in-package READ-ONLY self-inspection (e.g. reading the glossary or a pack file)
//
// TWO THINGS THIS GATE REFUSES TO DO:
//   1. It does NOT count an `import ... from 'node:fs'` that appears in a COMMENT or in a DATA STRING (the
//      false-positive family this repository keeps catching). The detector runs on comment-stripped source and
//      demands statement position; the self-probe below proves all four cases behave.
//   2. It is NOT "the import exists ⇒ pass": the set of importers must EQUAL the recorded table plus the files that
//      carry an explicit `fs-purpose: <kind>` marker, so a NEW importer with no declared purpose is RED.
//
// Run: node tests/audit-fs-purpose.test.mjs
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripComments } from './_lib/strip-comments.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; console.error('  FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}

const KINDS = ['guard', 'audit', 'self-audit']

/**
 * Real filesystem imports, in STATEMENT POSITION only.
 *   · ESM:            `import { a, b } from 'node:fs'` / `import fs from 'fs'` / `import 'node:fs'`
 *   · CJS:            `const fs = require('node:fs')` / a bare `require('node:fs')` at line start
 * A mention inside a comment is gone before we look (stripComments); a mention inside a STRING is not at statement
 * position, so neither `// import x from 'node:fs'` nor `const s = "require('node:fs')"` matches.
 */
export function fsImports(source) {
  const clean = stripComments(String(source))
  const out = []
  const lines = clean.split(/\r?\n/)
  lines.forEach((line, i) => {
    if (/^[ \t]*import\b[^;]*?from\s+['"](?:node:)?fs['"]/.test(line)) { out.push(i + 1); return }
    if (/^[ \t]*import\s+['"](?:node:)?fs['"]/.test(line)) { out.push(i + 1); return }
    if (/^[ \t]*(?:const|let|var)\s+[^=]+=\s*require\(\s*['"](?:node:)?fs['"]\s*\)/.test(line)) { out.push(i + 1); return }
    if (/^[ \t]*require\(\s*['"](?:node:)?fs['"]\s*\)/.test(line)) out.push(i + 1)
  })
  return out
}

/** The declared purpose for an import on `lineNo`: an explicit `fs-purpose: <kind>` comment within 3 lines above. */
export function declaredKind(source, lineNo) {
  const lines = String(source).split(/\r?\n/)
  for (let i = Math.max(0, lineNo - 4); i <= lineNo - 1; i++) {
    const m = lines[i] && lines[i].match(/fs-purpose:\s*([a-z-]+)/)
    if (m) return m[1]
  }
  return null
}

// ── SELF-PROBE 1: the detector ignores comments and data strings (the false-positive family)
{
  const samples = {
    commented: "// import { x } from 'node:fs'\nconst a = 1",
    dataString: 'const s = "require(\'node:fs\')"\nconst t = 2',
    realEsm: "import { readFileSync } from 'node:fs'",
    realCjs: "const fs = require('node:fs')",
  }
  const hit = Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, fsImports(v).length]))
  ok(hit.commented === 0 && hit.dataString === 0 && hit.realEsm === 1 && hit.realCjs === 1,
    '★ SELF-PROBE: a `node:fs` mention in a COMMENT or in a DATA STRING is NOT an import; a real ESM import and a real require ARE',
    hit)
}

// ── SELF-PROBE 2: the declaration checker accepts a marker and rejects a bare import
{
  const withMarker = "// fs-purpose: audit - the kernel writes its own audit anchors\nimport { appendFileSync } from 'node:fs'"
  const bare = "import { readFileSync } from 'node:fs'"
  ok(fsImports(withMarker).length === 1 && declaredKind(withMarker, 2) === 'audit',
    '★ SELF-PROBE: an import preceded by `fs-purpose: audit` is detected AND its kind is read', { kind: declaredKind(withMarker, 2) })
  ok(fsImports(bare).length === 1 && declaredKind(bare, 1) === null,
    '★ SELF-PROBE: a bare import has NO declared kind (so it cannot pass by existing)')
}

/** Walk every shipped .js under the vmu package. */
const walk = (rel, out = []) => {
  for (const e of readdirSync(rel, { withFileTypes: true })) {
    const p = join(rel, e.name)
    if (e.isDirectory()) { if (!/node_modules|docs/.test(p)) walk(p, out) } else if (e.name.endsWith('.js')) out.push(p)
  }
  return out
}

// RECORDED, NOT HIDDEN: the importers that predate this gate, each with the kind its code justifies (I read each
// one). A NEW importer must NOT be added here - it must carry `fs-purpose: <kind>` in its own file, which is what
// the equality assertion below enforces.
const RECORDED = {
  'kernel/guard.js': { kind: 'guard', why: 'the symlink gate reads lstat to DECIDE whether a path escapes the root (comment at :8)' },
  'kernel/index.js': { kind: 'audit', why: 'appendFileSync/mkdirSync write the kernel\'s own audit anchors and logs' },
  'kernel/records.js': { kind: 'audit', why: 'reads record files for the content-addressed archive (the framework\'s own anchors)' },
  'host-math.js': { kind: 'audit', why: 'materialises the framework\'s own computation artifacts in and out of the workspace' },
  'vibe-math-vmu.js': { kind: 'self-audit', why: 'READ-ONLY in-package inspection (glossary.json / pack prompt files)' },
}

const files = walk(VMU)
const importers = []
const marked = []
for (const f of files) {
  const rel = relative(VMU, f).replace(/\\/g, '/')
  const src = readFileSync(f, 'utf8')
  for (const line of fsImports(src)) {
    importers.push({ rel, line })
    const kind = declaredKind(src, line)
    if (kind) marked.push({ rel, line, kind })
  }
}

console.log('=== 1. THE SCAN IS NOT VACUOUS ===')
ok(importers.length >= 5, 'the scan finds the known filesystem consumers (>= 5)', { count: importers.length, at: importers.map((i) => i.rel + ':' + i.line) })

console.log('=== 2. EVERY IMPORTER HAS A SANCTIONED, RECORDED PURPOSE ===')
const unknown = importers.filter((i) => !RECORDED[i.rel] && !marked.some((m) => m.rel === i.rel && m.line === i.line))
ok(unknown.length === 0,
  '★ every module that directly imports node:fs carries an explicit `fs-purpose: <kind>` comment, or is one of the RECORDED (pre-gate) consumers named in this file - a NEW undeclared consumer is RED',
  unknown)
const badKinds = Object.entries(RECORDED).filter(([, v]) => !KINDS.includes(v.kind)).map(([k, v]) => k + ':' + v.kind)
  .concat(marked.filter((m) => !KINDS.includes(m.kind)).map((m) => m.rel + ':' + m.kind))
ok(badKinds.length === 0, 'every declared kind is one of the three sanctioned ones', { allowed: KINDS, bad: badKinds })

console.log('=== 3. THE SET IS CLOSED (no silent additions, no stale records) ===')
const importerFiles = [...new Set(importers.map((i) => i.rel))].sort()
const knownFiles = [...new Set(Object.keys(RECORDED).concat(marked.map((m) => m.rel)))].sort()
// RULE E (caught by the very gate this file is: a set-equality check between two EMPTY collections is vacuously
// true). Both sides are pinned non-empty INSIDE the assertion, so the equality has to be earned.
ok(importerFiles.length > 0 && knownFiles.length > 0 && JSON.stringify(importerFiles) === JSON.stringify(knownFiles),
  '★ the filesystem importers are EXACTLY the recorded/marked set (both sides non-empty) - adding a consumer without declaring it fails here',
  { importerFiles, knownFiles })
const stale = Object.keys(RECORDED).filter((k) => !importerFiles.includes(k))
ok(stale.length === 0, 'and no RECORDED entry is stale (a file that stopped importing must be removed from the table)', stale)

console.log('=== 4. THE TABLE IS A RECORD, NOT A DUMPING GROUND ===')
ok(Object.values(RECORDED).every((v) => typeof v.why === 'string' && v.why.length >= 20),
  'every recorded consumer carries a REASON (why this module may touch the filesystem), so the table stays auditable')
ok(Object.keys(RECORDED).length <= 8,
  'the recorded table stays small (a growing table would mean the rule is being bypassed instead of followed)',
  Object.keys(RECORDED).length)

console.log('')
console.log('declared purposes:')
for (const [k, v] of Object.entries(RECORDED)) console.log('  · ' + k.padEnd(22) + ' [' + v.kind + '] ' + v.why)
for (const m of marked) console.log('  · ' + (m.rel + ':' + m.line).padEnd(22) + ' [' + m.kind + '] (in-file marker)')

console.log('')
console.log('=== FS PURPOSE: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)
