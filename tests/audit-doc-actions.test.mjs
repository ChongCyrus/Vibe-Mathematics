// tests/audit-doc-actions.test.mjs — docs/03 action lists must match the live tool enums.
// Positive: every enum value appears in its face's docs row.
// Negative: a docs action that no longer exists is reported too.
// `--selftest` proves BOTH directions with synthetic rows before the real scan.
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const DOC = join(REPO, 'vibe-math-vmu', 'docs', '03-interface-contract.md')
const SELFTEST = process.argv.includes('--selftest')

let passed = 0, failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail ? ' — ' + detail : ''))
  console.error('  FAIL ' + label + (detail ? ' — ' + detail : ''))
  return false
}

const actionOf = (line) => {
  const m = line.match(/`action=([^`]+)`/)
  if (!m) return null
  return m[1].split(/\\\|/).map((s) => s.replace(/`/g, '').trim()).filter(Boolean)
}
const checkRow = (enums, line) => {
  const shown = actionOf(line) || []
  return {
    missing: enums.filter((a) => !shown.includes(a)),
    extra: shown.filter((a) => /^[a-z][A-Za-z0-9_]*$/.test(a) && !enums.includes(a)),
  }
}

if (SELFTEST) {
  console.log('=== DOC ACTIONS SELFTEST ===')
  const e = ['list', 'open', 'close']
  ok(checkRow(e, '| `vibe_vmu_x` | `action=list\\|open\\|close` |').missing.length === 0,
    '正例：docs 含全部 enum ⇒ missing 0')
  ok(checkRow(e, '| `vibe_vmu_x` | `action=list\\|open` |').missing.includes('close'),
    '反例：docs 少一个 enum ⇒ missing 命中 close')
  ok(checkRow(e, '| `vibe_vmu_x` | `action=list\\|open\\|close\\|ghost` |').extra.includes('ghost'),
    '反向：docs 写了代码没有的 ghost ⇒ extra 命中 ghost')
  console.log(`=== DOC ACTIONS SELFTEST: ${passed} passed, ${failed} failed ===`)
  process.exit(failed === 0 ? 0 : 1)
}

const root = mkdtempSync(join(tmpdir(), 'vmu-doc-actions-'))
const specs = []
try {
  const entry = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)
  const handle = entry.apply({
    effect: (fn) => fn(), on: () => () => {},
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }, {
    root, workspace: root, clock: () => 1000, packs: ['v5r'],
    vmu: { 'vmu.tools.faces': ['*'], 'vmu.tools.allowAll': true },
  })
  await handle.ready()

  const enums = new Map()
  for (const spec of specs) {
    const p = spec && spec.parameters && spec.parameters.properties
    if (p && p.action && Array.isArray(p.action.enum)) enums.set(spec.name, p.action.enum)
  }
  const lines = readFileSync(DOC, 'utf8').split('\n')
  const rows = new Map()
  for (const line of lines) {
    const m = line.match(/`(vibe_vmu_[A-Za-z0-9_]+)`/)
    if (!m) continue
    const tokens = actionOf(line)
    if (!tokens) continue
    const prev = rows.get(m[1])
    // A face may be mentioned in several tables; the row with the LONGEST action list is the action row.
    if (!prev || tokens.length > prev.tokens.length) rows.set(m[1], { line, tokens })
  }

  ok(enums.size >= 20, 'non-vacuous: live specs expose action enums', String(enums.size))
  let checked = 0
  for (const [face, list] of enums) {
    const row = rows.get(face)
    if (!row) continue
    checked++
    const { missing, extra } = checkRow(list, row.line)
    ok(missing.length === 0, face + ': every live action is documented', missing.join('|'))
    ok(extra.length === 0, face + ': docs name no action the code lacks', extra.join('|'))
  }
  ok(checked >= 20, 'non-vacuous: docs rows matched live action faces', String(checked))

  // The reverse criterion must be able to FAIL on the real file too: if any face's live enum is
  // empty or the docs row disappears, the checks above are vacuous. This is the guard against that.
  ok([...enums.values()].every((v) => v.length > 0), 'non-vacuous: every matched enum is non-empty')
} finally {
  try { rmSync(root, { recursive: true, force: true }) } catch { /* temp */ }
}

console.log(`=== DOC ACTIONS: ${passed} passed, ${failed} failed ===`)
if (failures.length) console.log('FAILURES:\n  - ' + failures.join('\n  - '))
process.exit(failed === 0 ? 0 : 1)
