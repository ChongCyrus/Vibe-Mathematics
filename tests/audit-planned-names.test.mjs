// tests/audit-planned-names.test.mjs - a documented planned name must not HIDE a capability that exists.
//
// WHY IT EXISTS. Several rows in the vmu volumes once claimed a capability was missing while it was implemented, wired and
// even exposed - as an ACTION of a registered tool. Each was found by hand, one at a time, which is why this exists.
//
// WHAT COUNTS AS A DEFECT - exactly two things, and nothing else:
//   1. a planned row names something that IS a registered tool (then the row must not mark it at all);
//   2. a planned row names something whose capability exists as an ACTION, while the row does not say so.
// A planned row with NOTHING behind it is not a defect - that is what "planned" means. An earlier version flagged those
// and had to be withdrawn: it was too strict, not too loose.
//
// HOW "PLANNED" IS DECIDED, after three failed attempts. Two rules that were measured on the real tables, not guessed:
//   * the mark must be in the HEAD cells (1..3) - searching the whole row misfires, because rows legitimately quote the old
//     mark while stating what is true now;
//   * a row that states a resolution is not planned, whatever it quotes.
//
// SCOPE: every volume that carries such a table - six of them today. The predicate is exercised on a SYNTHETIC table that
// mirrors the real shape, because a guard that cannot fire proves nothing.
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

/** A sentence saying the item is resolved, withdrawn, or already carried elsewhere. */
const RESOLVED = /已移出|降级|不再实现|已实现并已注册|已由|覆盖|库面|能力已实现|能力已具备|真名|同名陷阱/

/** Planned rows: the mark is in the head cells and the row does not state a resolution. Only cell 1 holds the names. */
function plannedRows(lines) {
  const rows = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (!l.trim().startsWith('|')) continue
    const c = l.split('|')
    const head = c.slice(1, 4).join('|')
    if (!/⛔/.test(head)) continue
    // SYMMETRY: the resolution conclusion is read from the HEAD as well. Reading it from the whole row silently excluded
    // rows whose DESCRIPTION happened to contain a word like 覆盖 or 库面 - which is how two volumes vanished unnoticed.
    if (RESOLVED.test(head)) continue
    // The name cell is the FIRST of the head cells that carries a backticked name: some volumes put a category in cell 1
    // (接口形状, 工具（计划）) and the tool name after it, and those rows were invisible to an earlier version.
    let names = []
    for (const cell of c.slice(1, 4)) {
      names = [...(cell || '').matchAll(/`(vibe_vmu_[a-z_]+)`/g)].map((m) => m[1])
      if (names.length) break
    }
    if (names.length) rows.push({ line: i + 1, l, names })
  }
  return rows
}

/** The two defects, and only those two. Split out so the predicate can be exercised on a synthetic table. */
function defects(rows, tools, actions, file) {
  const found = []
  for (const r of rows) {
    for (const n of r.names) {
      const where = (file ? file + ' ' : '') + 'L' + r.line + ' ' + n + ': '
      if (tools.has(n)) { found.push(where + 'IS a registered tool, so the row must not mark it'); continue }
      const short = n.replace('vibe_vmu_', '')
      const asAction = [...actions.keys()].filter((a) => a.toLowerCase().includes(short))
      if (asAction.length) found.push(where + 'its capability is the action ' + asAction.join('/') + ' and the row does not say so')
    }
  }
  return found
}

const host = readFileSync(join(REPO, 'vibe-math-vmu', 'host.js'), 'utf8')
const { tools, actions } = readSurface(host)

console.log('=== 1. THE SURFACE IS READ FROM THE SOURCE OF TRUTH ===')
ok(tools.size >= 8, 'the published tool registry is read', { tools: tools.size })
ok(actions.size >= 20, 'and the ACTION enums too - the column that was missed for three rounds', { actions: actions.size })

console.log('=== 2. BOTH DEFECTS AND THE QUIET CASES ARE EXERCISED ON A SYNTHETIC TABLE ===')
// mirrors the real shape: the mark sits in cell 1, and one row states a resolution
const synthetic = [
  '| 工具（规划，⛔ 未实现） | 参数草案 | 覆盖的广度项 |',
  '|---|---|---|',
  '| `vibe_vmu_status`（⛔ 未实现） | `x` | 已注册的工具 |',
  '| `vibe_vmu_ballot`（⛔ 未实现） | `x` | 表决 |',
  '| `vibe_vmu_imaginary`（⛔ 未实现） | `x` | 谁也没有 |',
  '| `vibe_vmu_finished`（⛔ 未实现） | `x` | ✅ 已实现并已注册 |',
]
const synthRows = plannedRows(synthetic)
ok(synthRows.length === 3, 'the marked rows are planned and the one stating a resolution is not', { planned: synthRows.length })
const synthFound = defects(synthRows, tools, actions, '')
ok(synthFound.some((s) => s.includes('IS a registered tool')), 'defect 1 fires: a planned row naming a registered tool')
ok(synthFound.some((s) => s.includes('the action')), 'defect 2 fires: a planned row hiding a capability that is an action')
ok(!synthFound.some((s) => s.includes('vibe_vmu_imaginary')), 'and a planned row with NOTHING behind it is quiet, because that is what planned means')
ok(!synthFound.some((s) => s.includes('vibe_vmu_finished')), 'while a row that states a resolution is quiet too')

console.log('=== 3. EVERY VOLUME THAT CARRIES SUCH A TABLE PASSES ===')
let total = 0
const volumes = []
const foundAll = []
const allDocs = readdirSync(DOCS).filter((x) => x.endsWith('.md'))
for (const f of allDocs) {
  const rows = plannedRows(readFileSync(join(DOCS, f), 'utf8').split('\n'))
  if (!rows.length) continue
  volumes.push(f)
  total += rows.length
  for (const d of defects(rows, tools, actions, f)) foundAll.push(d)
}
// the property is COVERAGE of the whole docs directory, not a guessed volume count
ok(volumes.length >= 1, 'at least one volume carries a planned-tool table', { volumes: volumes.length, of: allDocs.length })
ok(total >= 20, 'and they carry the rows the check is for', { plannedRows: total })
ok(foundAll.length === 0,
  'not one of the ' + total + ' planned rows hidden across ' + volumes.length + ' volumes marks a registered tool, and none hides a capability that exists as an action',
  { found: foundAll.slice(0, 6) })

console.log('=== 4. THE VOLUMES THAT ARE NOT SELECTED HAVE STATED REASONS ===')
// A volume can carry a mark and still be out of scope, for one of exactly two reasons: its rows state a resolution, or its
// rows mark something that is not a TOOL at all (a protocol, an interface shape). Anything else would mean the check is
// silently missing rows, which is the defect this whole file exists to prevent.
const unexplained = []
for (const f of allDocs) {
  const lines = readFileSync(join(DOCS, f), 'utf8').split('\n')
  const marked = []
  lines.forEach((l, i) => {
    if (!l.trim().startsWith('|') || !/⛔/.test(l)) return
    const c = l.split('|')
    marked.push({ line: i + 1, l, c })
  })
  if (!marked.length) continue
  const selected = volumes.includes(f)
  if (selected) continue
  for (const m of marked) {
    const head = m.c.slice(1, 4).join('|')
    const statesResolution = RESOLVED.test(head)
    const namesATool = /\`vibe_vmu_[a-z_]+\`/.test(head)
    if (!statesResolution && namesATool) {
      unexplained.push(f + ' L' + m.line + ': marked, names a tool, and is neither selected nor resolved')
    }
  }
}
ok(unexplained.length === 0,
  'every volume carrying a mark is either selected by the check, or its rows state a resolution, or they mark something that is not a tool - so no volume falls out of the check unexplained',
  { unexplained: unexplained.slice(0, 6) })

console.log('=== PLANNED NAMES: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
