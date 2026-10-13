// tests/audit-doc-vs-code-tables.test.mjs - three doc tables that claim to mirror code, checked against that code.
//
// WHY THIS FILE. The session keeps finding the same failure: a table written once, wearing an adjective ("逐字", "与代码一致")
// that tells the reader to stop checking. Three tables are checkable mechanically today:
//   1. docs/06 section 4's ORDER_RANGES, claimed to be verbatim - measured identical this round;
//   2. docs/06 section 3's register() field list, claimed verbatim - it was MISSING `lang`, found and fixed this round;
//   3. docs/08 section 11.4's hook table, which marks each group ✓ registered or ✗ planned - checkable against VU_HOOKS.
// A fourth, docs/03 section 2's service table, CANNOT be checked this way: it names 8 of 72 registered services on purpose
// once its heading is honest, so the assertion there is that it SAYS so rather than that it is complete.
import { readFileSync, existsSync } from 'node:fs'
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

console.log('=== 5. THE CAPABILITY VOCABULARY: DOC TABLE AND RUNTIME AGREE, BOTH WAYS ===')
// Added in round 639. docs/05 section 3.2 presents the capability vocabulary as a frozen twelve-entry list, and the runtime declares the
// same list. vmu-rules asserts that the RUNTIME's use of capabilities stays inside the vocabulary, but nothing asserted that the
// DOCUMENT's copy still matches it - so adding a capability would leave the table silently short, which is the failure this file exists
// to catch: a table wearing an adjective that tells the reader to stop checking. Both directions are asserted, because an index can also
// gain an entry the runtime does not have.
{
  const busMod = await import('../vibe-math-vmu/kernel/bus.js')
  const caps = busMod.CAPABILITIES
  ok(Array.isArray(caps) && caps.length > 5, 'the runtime declares a capability vocabulary', { n: caps && caps.length })
  const lines = doc('05-middleware.md').split('\n')
  const h = lines.findIndex((l) => /^### 3\.2 /.test(l))
  ok(h >= 0, 'and the middleware volume carries the vocabulary section', { at: h })
  const named = new Set()
  for (let i = h + 1; i < lines.length && !/^#{2,4} /.test(lines[i]); i++) {
    if (!lines[i].trim().startsWith('|')) continue
    for (const c of caps) if (lines[i].includes(c)) named.add(c)
  }
  const missing = caps.filter((c) => !named.has(c))
  ok(missing.length === 0, 'every capability the runtime declares is named in the document table', { missing })
  // and no capability-shaped token in the table is absent from the runtime
  const cells = []
  for (let i = h + 1; i < lines.length && !/^#{2,4} /.test(lines[i]); i++) {
    if (!lines[i].trim().startsWith('|')) continue
    for (const m of lines[i].matchAll(/`([a-z][a-z-]+)`/g)) cells.push(m[1])
  }
  const extra = [...new Set(cells)].filter((c) => /-/.test(c) && !caps.includes(c))
  ok(extra.length === 0, 'and the table invents no capability the runtime does not declare', { extra })
}

console.log('=== 6. THE TRACEABILITY TABLE NAMES SUITES THAT EXIST, AND COVERS EVERY REQUIREMENT ===')
// Added in round 640, from the same question round 639 asked: a table that mirrors something can be guarded on one side only. The gates
// volume's section 2.1 says its rows are one per requirement and that the real family names live there, so both halves are checkable -
// every requirement has a row, and every suite a row names is a file. Round 637 verified this by hand with a one-off probe, which is
// exactly what does NOT stop the next drift.
{
  const lines = doc('11-gates-and-development.md').split('\n')
  const h = lines.findIndex((l) => /^#{2,4} 2\.1 /.test(l))
  ok(h >= 0, 'the gates volume carries the traceability section', { at: h })
  let end = lines.length
  for (let i = h + 1; i < lines.length; i++) if (/^#{2,4} 2\.2 |^## /.test(lines[i])) { end = i; break }
  const body = lines.slice(h, end)
  const named = new Set()
  for (const l of body) for (const m of l.matchAll(/\bR(\d+)\b/g)) named.add(Number(m[1]))
  const missingR = []
  for (let i = 1; i <= 15; i++) if (!named.has(i)) missingR.push('R' + i)
  ok(missingR.length === 0, 'every requirement R1 through R15 has a row, which is the property the section claims', { missingR })
  const suites = [...new Set([...body.join('\n').matchAll(/tests\/([a-z0-9-]+)\.test\.mjs/g)].map((m) => m[1]))]
  ok(suites.length > 10, 'and the rows name a substantial set of suites', { n: suites.length })
  const gone = suites.filter((s) => !existsSync(join(REPO, 'tests', s + '.test.mjs')))
  ok(gone.length === 0, 'and every suite it names is a file that exists, so a rename cannot leave a dead pointer here', { gone })
}

console.log('=== DOC VS CODE TABLES: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
