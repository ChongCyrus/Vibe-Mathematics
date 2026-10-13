// tests/audit-tool-table.test.mjs - the assertion docs/18 section 1 PROMISES in its own words and never had.
//
// "工具名清单一致：TOOL_NAMES 的 9 个值 ＋ math_computation 必须与本卷 §1 表逐字相同（断言：从 host.js 导入 TOOL_NAMES 并逐名比较）"
// A documented assertion that does not exist is the worst form of the drift this session keeps finding: the reader is told to
// stop checking by a sentence that is itself unverified. So this file IS that assertion, and it also checks the count the
// heading states, because a table of nine rows under a heading that says nine looked right for a whole round after the code
// had ten.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { TOOL_NAMES } from '../vibe-math-vmu/host.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const doc = readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '18-command-and-protocol-reference.md'), 'utf8')
const codeNames = Object.values(TOOL_NAMES)

console.log('=== 1. THE REGISTRY IS READ FROM THE CODE ===')
ok(codeNames.length >= 8, 'TOOL_NAMES publishes the surface', { n: codeNames.length })

console.log('=== 2. EVERY PUBLISHED NAME APPEARS IN THE VOLUME S TABLE ===')
const missingFromTable = codeNames.filter((n) => !doc.includes('`' + n + '`'))
ok(missingFromTable.length === 0,
  'every name the host registers is named in the command reference, so a reader can find it',
  { missing: missingFromTable })

console.log('=== 3. AND THE TABLE DOES NOT INVENT NAMES ===')
// every vibe_vmu_* name the table lists (in a row's first cell) must be published
// ONLY section 1: later sections have their own planned-tool tables, and a planned name is not an invented one.
const docLines = doc.split('\n')
const start = docLines.findIndex((l) => /^## 1\./.test(l))
let end = docLines.length
for (let i = start + 1; i < docLines.length; i++) if (/^## /.test(docLines[i])) { end = i; break }
const rows = docLines.slice(start, end).filter((l) => l.trim().startsWith('| `vibe_vmu_'))
const tableNames = rows.map((l) => (/(`vibe_vmu_[a-z_]+`)/.exec(l) || [])[1]).filter(Boolean).map((s) => s.replace(/`/g, ''))
const invented = tableNames.filter((n) => !codeNames.includes(n))
ok(invented.length === 0, 'and it lists no tool the host does not publish', { invented, rows: rows.length })

console.log('=== 4. THE HEADING S COUNT MATCHES THE ROWS ===')
const m = /## 1\. .*?（(\d+) 个 `vibe_vmu_\*`/.exec(doc)
ok(!!m, 'the heading states how many vibe_vmu_* tools there are, which is a claim worth checking')
const stated = m ? Number(m[1]) : -1
ok(stated === tableNames.length,
  'and the number it states equals the number of rows beneath it - a table of nine under a heading that says ten is how this drifted before',
  { stated, rows: tableNames.length })
ok(stated === codeNames.length,
  'and both equal the number the host actually publishes',
  { stated, published: codeNames.length })

console.log('=== 5. THE ASSERTION THE VOLUME PROMISED IS THIS ONE ===')
ok(/断言：从 `host\.js` 导入 `TOOL_NAMES` 并逐名比较/.test(doc),
  'the volume still names the assertion it expects, so this file can be traced back to the sentence that asked for it')

console.log('=== TOOL TABLE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
