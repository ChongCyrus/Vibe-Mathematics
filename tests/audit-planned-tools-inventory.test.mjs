// tests/audit-planned-tools-inventory.test.mjs - the roadmap's planned-tool table must match the volumes' ⛔ marks, both ways.
//
// WHY. Goal 5 asks for a minimal-but-strong vmu, and the ordering depends on knowing which planned tools are thin wrappers over
// existing services and which would be new work. The table in docs/14 says so per tool; this guard keeps it from drifting from
// the marks it is derived from, in both directions, so a tool cannot be added to the volumes without appearing in the inventory
// and the inventory cannot name a tool the volumes do not plan.
import { readFileSync, readdirSync } from 'node:fs'
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

console.log('=== 1. THE MARKED TOOLS ARE READ FROM THE VOLUMES ===')
const docs = readdirSync(DOCS).filter((f) => /^\d\d-.*\.md$/.test(f) && !f.startsWith('28')).sort()
const marked = new Set()
for (const f of docs) {
  const t = readFileSync(join(DOCS, f), 'utf8')
  for (const m of t.matchAll(/`(vibe_vmu_[a-z_]+)`[^`\n]{0,12}⛔|⛔[^`\n]{0,12}`(vibe_vmu_[a-z_]+)`/g)) marked.add(m[1] || m[2])
}
ok(marked.size >= 20, 'the volumes mark a substantial number of planned tools', { n: marked.size })

console.log('=== 2. AND THE ROADMAP TABLE MATCHES THEM BOTH WAYS ===')
const roadmap = readFileSync(join(DOCS, '14-open-items-and-roadmap.md'), 'utf8')
const tabled = new Set([...roadmap.matchAll(/^\| `(vibe_vmu_[a-z_]+)` \| `docs\/\d\d` \|/gm)].map((m) => m[1]))
ok(tabled.size >= 20, 'the inventory table is present and substantive', { n: tabled.size })
const absentFromTable = [...marked].filter((m) => !tabled.has(m))
const invented = [...tabled].filter((t) => !marked.has(t))
ok(absentFromTable.length === 0, 'every ⛔-marked tool appears in the inventory', { absentFromTable })
ok(invented.length === 0, 'and the inventory names no tool the volumes do not plan', { invented })

console.log('=== 3. AND THE TABLE STATES WHAT DECIDES THE ORDERING ===')
ok(/已经有服务载体或 settings 家族|服务载体/.test(roadmap),
  'the inventory records which planned tools already have a carrier, because that is what makes an implementation minimal')

console.log('=== PLANNED INVENTORY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
