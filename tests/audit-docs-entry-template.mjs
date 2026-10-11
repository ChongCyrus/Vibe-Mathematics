// tests/audit-docs-entry-template.mjs — every capability entry must carry its maturity markers.
//
// The vmu design volumes write each infrastructure item as a single line in the template described in docs/08 §0.1,
// shaped `- **name** ｜ purpose ｜ who ｜ interface ｜ adjustable ｜ codes ｜ … ｜ maturity ｜ priority`. The maturity
// field is what makes the set readable: it is the difference between "designed" and "works today", which is this
// project's whole discipline. Measured before writing this check: 171 template lines across docs/08 and docs/17, and
// ZERO of them lacked a ✓/✗ marker, so as a standing rule it is silent - and it can fail, which the selftest proves by
// requiring a synthetic entry WITHOUT a marker to be flagged. A check that always passes is only acceptable when it is
// shown to be able to fail; that rule has been learned the hard way in this session.
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DOCS = join(HERE, '..', 'vibe-math-vmu', 'docs')
const quiet = process.argv.includes('--quiet')

const ENTRY = /^\s*-\s+\*\*[^*]+\*\*\s*｜/
const MARK = /[✓✗✅⛔◐]/

/** @returns {Array<{file:string,line:number,text:string}>} */
export function scanEntries(files) {
  const out = []
  for (const { name, text } of files) {
    text.split('\n').forEach((line, i) => {
      if (ENTRY.test(line) && !MARK.test(line)) out.push({ file: name, line: i + 1, text: line.trim().slice(0, 110) })
    })
  }
  return out
}

const files = readdirSync(DOCS)
  .filter((x) => x.endsWith('.md'))
  .sort()
  .map((name) => ({ name, text: readFileSync(join(DOCS, name), 'utf8') }))

let entries = 0
for (const f of files) for (const line of f.text.split('\n')) if (ENTRY.test(line)) entries += 1
const findings = scanEntries(files)

if (process.argv.includes('--selftest')) {
  const control = scanEntries([{ name: 'synthetic.md', text: '- **控制项** ｜ 目的：证明本检查能红 ｜ 成熟度：未标' }])
  const okControl = control.length === 1
  const okClean = scanEntries([{ name: 'synthetic.md', text: '- **正常项** ｜ 目的：无 ｜ 成熟度：**已实现 ✓**' }]).length === 0
  console.log('  selftest: an entry WITHOUT a marker is flagged = ' + okControl + '   an entry WITH one is not = ' + okClean + '   => ' + (okControl && okClean ? 'PASS ✓' : 'FAIL ✗'))
  if (!okControl || !okClean) process.exit(1)
}

if (!quiet) console.log('  template entries scanned: ' + entries)
for (const h of findings) console.log('FINDING ' + h.file + ':' + h.line + '  a capability entry carries no maturity marker :: ' + h.text)
console.log('=== DOCS ENTRY TEMPLATE: ' + entries + ' entr(ies) scanned, ' + findings.length + ' without a maturity marker ===')
process.exit(findings.length > 0 ? 1 : 0)
