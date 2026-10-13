// tests/audit-doc-vs-code-tables.test.mjs - three doc tables that claim to mirror code, checked against that code.
//
// WHY THIS FILE. The session keeps finding the same failure: a table written once, wearing an adjective ("逐字", "与代码一致")
// that tells the reader to stop checking. Three tables are checkable mechanically today:
//   1. docs/06 section 4's ORDER_RANGES, claimed to be verbatim - measured identical this round;
//   2. docs/06 section 3's register() field list, claimed verbatim - it was MISSING `lang`, found and fixed this round;
//   3. docs/08 section 11.4's hook table, which marks each group ✓ registered or ✗ planned - checkable against VU_HOOKS.
// A fourth, docs/03 section 2's service table, CANNOT be checked this way: it names 8 of 72 registered services on purpose
// once its heading is honest, so the assertion there is that it SAYS so rather than that it is complete.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const DOCS = join(REPO, 'vibe-math-vmu', 'docs')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const doc = (f) => readFileSync(join(DOCS, f), 'utf8')

console.log('=== 1. ORDER_RANGES: THE TABLE AND THE CODE AGREE ===')
{
  const src = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'prompt', 'index.js'), 'utf8')
  const block = /ORDER_RANGES = Object\.freeze\(\{([\s\S]{0,800}?)\}\)/.exec(src)
  const codeRanges = block ? [...block[1].matchAll(/(\w+):\s*\[(\d+),\s*(\d+)\]/g)].map((m) => ({ name: m[1], lo: Number(m[2]), hi: Number(m[3]) })) : []
  ok(codeRanges.length >= 4, 'the code declares the order ranges', { n: codeRanges.length })
  const d6 = doc('06-prompt-pipeline.md')
  const missing = codeRanges.filter((r) => !new RegExp('`' + r.name + '`[^\\n]*' + r.lo + '\\s*[–-]\\s*' + r.hi).test(d6))
  ok(missing.length === 0, 'and every one of them appears in the volume with the same bounds', { missing: missing.map((m) => m.name) })
}

console.log('=== 2. THE register() FIELD LIST IS COMPLETE ===')
{
  const src = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'prompt', 'index.js'), 'utf8')
  const start = src.indexOf('const entry = {')
  const block = start >= 0 ? src.slice(start, src.indexOf('}', src.indexOf('lang', start)) + 1) : ''
  const keys = [...new Set([...block.matchAll(/^\s{4,6}(\w+):/gm)].map((m) => m[1]))]
  ok(keys.length >= 5, 'the entry the registry stores is readable', { keys })
  const d6 = doc('06-prompt-pipeline.md')
  const sec3 = d6.slice(d6.indexOf('## 3.'), d6.indexOf('## 4.'))
  const absent = keys.filter((k) => !sec3.includes('`' + k + '`'))
  ok(absent.length === 0,
    'every field register() stores is named in the registration table, so the table can be read as the field list',
    { absent })
}

console.log('=== 3. THE HOOK TABLE S MARKS AGREE WITH VU_HOOKS ===')
{
  const bus = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'bus.js'), 'utf8')
  const hm = /VU_HOOKS = Object\.freeze\(\[([\s\S]{0,1500}?)\]\)/.exec(bus)
  const hooks = new Set(hm ? [...hm[1].matchAll(/'([a-z][a-z0-9/-]+)'/g)].map((m) => m[1]) : [])
  ok(hooks.size >= 10, 'the kernel publishes the hook list', { n: hooks.size })
  const lines = doc('08-primitives-meeting-ballot-workflow.md').split('\n')
  const h = lines.findIndex((l) => /11\.4/.test(l) && /^#/.test(l))
  const wrong = []
  for (let i = h + 1; i < lines.length && !/^#{2,4} /.test(lines[i]); i++) {
    const l = lines[i]
    if (!l.trim().startsWith('|')) continue
    const cells = l.split('|')
    const names = [...(cells[1] || '').matchAll(/`([a-z][a-z0-9/-]+)`/g)].map((x) => x[1])
    if (!names.length) continue
    const marked = (cells[cells.length - 2] || '').trim() === '✓'
    for (const n of names) {
      if (marked && !hooks.has(n)) wrong.push(n + ' is marked registered but is not in VU_HOOKS')
      if (!marked && hooks.has(n)) wrong.push(n + ' is marked planned but IS in VU_HOOKS')
    }
  }
  ok(wrong.length === 0, 'no hook is marked registered that the kernel does not publish, and none marked planned that it does', { wrong })
}

console.log('=== 4. THE SERVICE TABLE STATES ITS OWN SCOPE INSTEAD OF IMPLYING COMPLETENESS ===')
{
  const src = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js'), 'utf8')
  const services = [...new Set([...src.matchAll(/registry\.register\('([^']+)'/g)].map((m) => m[1]))]
  ok(services.length > 20, 'the kernel registers many services', { n: services.length })
  const d3 = doc('03-interface-contract.md')
  const sec2 = d3.slice(d3.indexOf('## 2.'), d3.indexOf('## 3.'))
  ok(/不是\*\*]发布面的全集|不是.*全集|registry\.register` 实际注册了/.test(sec2),
    'and the volume says its table is a subset rather than the whole published surface, which is the only honest reading')
  ok(new RegExp('\\*\\*' + services.length + '\\*\\*').test(sec2),
    'and it states the real number, so a reader can tell how incomplete the naming is', { registered: services.length })
}

console.log('=== DOC VS CODE TABLES: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
