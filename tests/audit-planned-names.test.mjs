// tests/audit-planned-names.test.mjs - a documented planned name must not hide a capability that already exists.
//
// WHY IT EXISTS, AND WHY IT IS WRITTEN THIS WAY. Five rows in the contract's planning table once claimed a capability was
// missing while it was implemented, wired and even exposed - as an ACTION of a registered tool. Every one was found by
// hand. An earlier version of this guard was withdrawn because it could not pass on a CORRECT table: it read every
// backticked name in a row, so the tool a row cites as the carrier looked like a name the row marks, and it decided
// "planned" by searching the whole row, so a row that quoted the old mark while stating the truth looked planned.
//
// The discriminator that works is exact: a row is planned iff its STATUS cell STARTS with the mark. Measured on the real
// table, nine rows start with it and three do not - and the three are exactly the rows that state a resolution.
//
// The predicate is exercised on a SYNTHETIC table as well, because a guard that cannot fire proves nothing.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

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

/** The published surface, read from the source of truth rather than restated here. */
function readSurface(hostSrc) {
  const tools = new Set((hostSrc.match(/'(vibe_vmu_[a-z_]+)'/g) || []).map((s) => s.replace(/'/g, '')))
  const actions = new Map()
  let cur = ''
  for (const line of hostSrc.split('\n')) {
    const m = /name: TOOL_NAMES\.(\w+)/.exec(line)
    if (m) cur = m[1]
    const e = /enum: \[([^\]]{4,200})\]/.exec(line)
    if (e && cur) for (const a of e[1].split(',')) actions.set(a.trim().replace(/'/g, ''), cur)
  }
  return { tools, actions }
}

/** A row is planned iff its STATUS cell starts with the mark; only its FIRST cell holds planned names. */
function plannedRows(lines, from) {
  const rows = []
  for (let i = from; i < lines.length; i++) {
    const l = lines[i]
    if (!l.trim().startsWith('|')) { if (rows.length) break; else continue }
    const c = l.split('|')
    if (!(c[3] || '').trim().startsWith('⛔')) continue
    const names = [...(c[1] || '').matchAll(/`(vibe_vmu_[a-z_]+)`/g)].map((m) => m[1])
    if (names.length) rows.push({ line: i + 1, l, names })
  }
  return rows
}

/** The audit itself, split out so it can be exercised on a synthetic table. */
function audit(rows, tools, actions) {
  const silent = []
  for (const r of rows) {
    for (const n of r.names) {
      if (tools.has(n)) { silent.push('L' + r.line + ' ' + n + ': IS a registered tool, so the row must not mark it'); continue }
      const short = n.replace('vibe_vmu_', '')
      const namesAnAction = [...actions.keys()].some((a) => a.toLowerCase().includes(short) && r.l.includes(a))
      const namesATool = [...tools].some((x) => x !== n && r.l.includes('`' + x + '`'))
      const statesConclusion = /已由|覆盖|库面|动作|已移出|降级|不再实现|同名陷阱|真名|能力已实现|能力已具备|已实现/.test(r.l)
      if (!namesAnAction && !namesATool && !statesConclusion) {
        silent.push('L' + r.line + ' ' + n + ': no tool, no action, and the row does not say where the capability lives')
      }
    }
  }
  return silent
}

const host = readFileSync(join(REPO, 'vibe-math-vmu', 'host.js'), 'utf8')
const { tools, actions } = readSurface(host)

console.log('=== 1. THE SURFACE IS READ FROM THE SOURCE OF TRUTH ===')
ok(tools.size >= 8, 'the published tool registry is read', { tools: tools.size })
ok(actions.size >= 20, 'and the ACTION enums too - the column that was missed for three rounds', { actions: actions.size })

console.log('=== 2. THE DISCRIMINATOR IS EXERCISED BOTH WAYS ON A SYNTHETIC TABLE ===')
const synthetic = [
  '| 工具（规划） | 意图 | 状态 |',
  '|---|---|---|',
  '| `vibe_vmu_status` | 已注册的工具 | ⛔ 未实现 |',
  '| `vibe_vmu_imaginary` | 谁也没有 | ⛔ 未实现 |',
  '| `vibe_vmu_finished` | 已经做完 | ✅ 已实现并已注册 |',
]
const synthRows = plannedRows(synthetic, 0)
ok(synthRows.length === 2, 'exactly the rows whose STATUS cell starts with the mark are treated as planned', { planned: synthRows.length })
const synthSilent = audit(synthRows, tools, actions)
ok(synthSilent.some((s) => s.includes('IS a registered tool')), 'a planned row naming an already-registered tool is flagged')
ok(synthSilent.some((s) => s.includes('no tool, no action')), 'and a planned row with nothing behind it and no explanation is flagged')
ok(!synthSilent.some((s) => s.includes('vibe_vmu_finished')), 'while a row that states a resolution is not')

console.log('=== 3. THE REAL TABLE PASSES ===')
const lines = readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '03-interface-contract.md'), 'utf8').split('\n')
const heading = lines.findIndex((l) => /^### 3\.2/.test(l))
ok(heading >= 0, 'the planning table is found in the interface contract')
const rows = plannedRows(lines, heading + 1)
ok(rows.length >= 5, 'and it still carries marked rows to check', { rows: rows.length })
const silent = audit(rows, tools, actions)
ok(silent.length === 0,
  'every marked row either names where its capability lives or states a resolution, so "not implemented" can no longer stand in for "implemented under another name"',
  { silent: silent.slice(0, 6) })

console.log('=== PLANNED NAMES: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
