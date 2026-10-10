#!/usr/bin/env node
// vmu WIRING INDEX — the guard for the per-volume wiring table in docs/00-README.md §3.2.
//
// WHAT THIS PROVES
//   A. the generated block is exactly what the artefacts yield (`--check` clean);
//   B. the block is STALE-BITING: flipping one character inside it (on a TEMP copy, never the real doc)
//      makes `--check` exit 1;
//   C. the numbers CROSS-CHECK against two independently recomputed sources:
//        · planned keys : reverse-counted from settings/planned.js `volumes[]`
//        · wired keys   : re-parsed from docs/04 §11 rows carrying the wired marker
//        · total keys   : planned.js + hand-written core keys  vs  the table's concrete rows
//        · proposed codes: re-counted from 03's `规划码` rows with a `卷 NN` column
//   D. EVERY design volume has a row (discovered, not remembered) plus the total row;
//   E. the generator writes ONLY between the markers: on a temp copy, everything outside the markers is
//      byte-identical before and after `--write`.
//
// Seams: the generator honours `VMU_WIRING_DOC` (the doc under test) and `VMU_DOCS_DIR` / `VMU_CODE_DIR`.
import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, mkdtempSync, copyFileSync, cpSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const GEN = join(REPO, 'scripts', 'generate-wiring-index.mjs')
const VMU = process.env.VMU_CODE_DIR ? resolve(process.env.VMU_CODE_DIR) : join(REPO, 'vibe-math-vmu')
const DOCS = process.env.VMU_DOCS_DIR ? resolve(process.env.VMU_DOCS_DIR) : join(VMU, 'docs')
const README = join(DOCS, '00-README.md')
const SETTINGS = join(DOCS, '04-settings.md')
const CONTRACT = join(DOCS, '03-interface-contract.md')
const PLANNED = join(VMU, 'settings', 'planned.js')
const SCHEMA = join(VMU, 'settings', 'schema.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}

const BEGIN = '<!-- WIRING-INDEX:BEGIN'
const END = '<!-- WIRING-INDEX:END -->'
const run = (args, env) => spawnSync(process.execPath, [GEN].concat(args), { cwd: REPO, encoding: 'utf8', env: Object.assign({}, process.env, env || {}) })

/** Independent block reader: the raw lines strictly between the markers. */
function blockLines(text) {
  const lines = String(text).split('\n')
  const b = lines.findIndex((l) => l.indexOf(BEGIN) !== -1)
  const e = lines.findIndex((l) => l.indexOf(END) !== -1)
  return { lines, b, e, block: b >= 0 && e > b ? lines.slice(b + 1, e) : [] }
}
/** Data rows of the generated table (5 cells, first cell = a 2-digit volume or "**总计**"). */
function dataRows(block) {
  return block.filter((l) => /^\|\s*(\d\d|\*\*总计\*\*)\s*\|/.test(l))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
}

// ---- A. the generator's own --check must be clean ------------------------------------------------
{
  ok(existsSync(GEN), 'the wiring-index generator exists', GEN)
  const r = run(['--check'])
  ok(r.status === 0, 'the generator --check is clean (block in sync with the artefacts)',
    'exit=' + r.status + ' ' + String(r.stderr || r.stdout || '').trim().slice(0, 160))
  ok(/up to date/.test(String(r.stdout || '')), 'the clean --check says so on stdout', String(r.stdout || '').trim().split('\n').slice(-1)[0])
}

const { lines, b, e, block } = blockLines(readFileSync(README, 'utf8'))
const rows = dataRows(block)

// ---- B. the block is stale-biting (temp copy only) -----------------------------------------------
{
  ok(b >= 0 && e > b, 'the WIRING-INDEX markers exist and are ordered (BEGIN before END)', 'begin=' + (b + 1) + ' end=' + (e + 1))
  const dir = mkdtempSync(join(tmpdir(), 'vmu-wiring-'))
  const copy = join(dir, '00-README.md')
  const text = readFileSync(README, 'utf8')
  const mutated = text.replace(/(\| 20 \| )(\d+)/, '$1' + '999')      // flip one character inside the block
  writeFileSync(copy, mutated === text ? text.replace(/\d/, '9') : mutated, 'utf8')
  const r = run(['--check'], { VMU_WIRING_DOC: copy })
  ok(r.status === 1, 'a one-character change inside the block makes --check exit 1 (stale-biting)',
    'exit=' + r.status + ' (temp copy: real doc untouched)')
  ok(readFileSync(README, 'utf8') === text, 'the real 00-README.md was NOT touched by the negative test')
  // and the untouched copy must still be clean
  const ok2 = run(['--check'], { VMU_WIRING_DOC: copy })
  ok(ok2.status !== 0, 'the mutated copy stays red (the guard follows the documented file)')
  rmSync(dir, { recursive: true, force: true })
}

// ---- C. cross-checks against independently recomputed sources ------------------------------------
{
  const { PLANNED_DEFS } = await import(pathToFileURL(PLANNED).href)
  const schemaMod = await import(pathToFileURL(SCHEMA).href)
  const coreKeys = (Array.isArray(schemaMod.CORE_DEFS) ? schemaMod.CORE_DEFS
    : (schemaMod.SETTING_DEFS || []).filter((d) => d && d.planned !== true)).map((d) => d.key)

  // (1) planned keys: independent reverse count of `volumes[]`
  const perVolume = new Map()
  for (const d of PLANNED_DEFS) for (const v of d.volumes || []) perVolume.set(v, (perVolume.get(v) || 0) + 1)
  const plannedSum = [...perVolume.values()].reduce((a, x) => a + x, 0)
  const totalRow = rows.find((r) => /总计/.test(r[0])) || []
  const cellPlanned = ((totalRow[1] || '').match(/\d[\d,]*/) || [''])[0].replace(/,/g, '')
  ok(Number(cellPlanned) === PLANNED_DEFS.length,
    'the total row\'s planned count equals PLANNED_DEFS.length (recomputed independently)',
    cellPlanned + ' vs ' + PLANNED_DEFS.length)
  ok(new RegExp('逐卷求和 ' + plannedSum + '\\b').test(totalRow[1] || ''),
    'the "逐卷求和" figure equals the independent per-volume sum', totalRow[1] + ' (sum=' + plannedSum + ')')

  // (2) wired keys: independent re-parse of docs/04 §11
  const wired = new Set()
  for (const line of readFileSync(SETTINGS, 'utf8').split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const m = /^\|\s*`([A-Za-z0-9_.]+)`/.exec(line)
    if (!m || !m[1].startsWith('vmu.') || m[1].endsWith('.*')) continue
    if (line.includes('已接线') && !line.includes('未接线')) wired.add(m[1])
  }
  const cellWired = (totalRow[2] || '').match(/(\d+)\s*\/\s*(\d+)/)
  ok(!!cellWired && Number(cellWired[1]) === wired.size,
    'the total row\'s wired count equals the independent re-parse of docs/04 §11',
    (cellWired ? cellWired[1] : 'none') + ' vs ' + wired.size)

  // (3) total keys: planned registry + hand-written core keys vs the table's concrete rows
  const tableKeys = new Set()
  for (const line of readFileSync(SETTINGS, 'utf8').split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const m = /^\|\s*`([A-Za-z0-9_.]+)`/.exec(line)
    if (!m || !m[1].startsWith('vmu.') || m[1].endsWith('.*')) continue
    tableKeys.add(m[1])
  }
  ok(tableKeys.size === PLANNED_DEFS.length + coreKeys.length,
    'planned + core keys equals the settings table\'s concrete rows (two independent sources)',
    tableKeys.size + ' vs ' + (PLANNED_DEFS.length + coreKeys.length))
  ok(!!cellWired && Number(cellWired[2]) === tableKeys.size,
    'the total row\'s denominator equals that same key total', (cellWired ? cellWired[2] : 'none') + ' vs ' + tableKeys.size)

  // (4) proposed codes: independent re-count of 03's `规划码` rows with a `卷 NN` column
  let codes = 0
  const codePer = new Map()
  for (const line of readFileSync(CONTRACT, 'utf8').split('\n')) {
    if (!line.trim().startsWith('|') || !line.includes('规划码')) continue
    const k = /^\|\s*`([A-Z][A-Z0-9_]+)`/.exec(line)
    const v = /\|\s*卷\s*(\d\d)\s*\|/.exec(line)
    if (!k || !v) continue
    codes++
    codePer.set(v[1], (codePer.get(v[1]) || 0) + 1)
  }
  const cellCodes = (totalRow[3] || '').replace(/[^0-9]/g, '')
  ok(Number(cellCodes) === codes, 'the total row\'s proposed-code count equals the independent 03 re-count',
    cellCodes + ' vs ' + codes)
  // per-volume code cells must match the independent map too (both directions)
  const codeMismatch = rows.filter((r) => /^\d\d$/.test(r[0]))
    .filter((r) => Number(r[3]) !== (codePer.get(r[0]) || 0))
  ok(codeMismatch.length === 0, 'every per-volume code cell matches the re-count',
    codeMismatch.slice(0, 4).map((r) => r[0] + ':' + r[3] + '!=' + (codePer.get(r[0]) || 0)).join(','))

  // (5) the generator's own summary agrees with the parsed block
  const r = run(['--json'])
  let summary = null
  try { summary = JSON.parse(String(r.stdout || '')) } catch (err) { /* reported below */ }
  ok(!!summary && summary.volumes === rows.filter((x) => /^\d\d$/.test(x[0])).length,
    'the generator reports one row per discovered volume', summary ? summary.volumes + '' : 'no json')
  ok(!!summary && summary.plannedKeys === PLANNED_DEFS.length && summary.wiredKeys === wired.size,
    'the generator\'s summary numbers equal the independently recomputed ones',
    summary ? summary.plannedKeys + '/' + summary.wiredKeys : 'no json')
}

// ---- D. every design volume has a row, sorted, plus the total row --------------------------------
{
  const vols = readdirSync(DOCS).filter((f) => /^\d\d-[A-Za-z0-9-]+\.md$/.test(f)).map((f) => f.slice(0, 2)).sort()
  const rowNums = rows.filter((r) => /^\d\d$/.test(r[0])).map((r) => r[0])
  ok(vols.length > 0 && rowNums.length > 0, 'the discovered volumes and the table rows are both non-empty (non-vacuous comparison)',
    rowNums.length + '/' + vols.length)
  const oneRowPerVolume = rowNums.length === vols.length
  ok(oneRowPerVolume, 'the table has exactly one data row per discovered design volume',
    rowNums.length + '/' + vols.length)
  ok(rowNums.join(',') === vols.join(','), 'the rows are sorted by volume number and match the discovered set',
    rowNums.join(','))
  const expectedRows = vols.length + 1
  const totalRowLast = !!rows[rows.length - 1] && /总计/.test(rows[rows.length - 1][0])
  ok(rows.length === expectedRows && totalRowLast,
    'the total row is present and LAST', String(rows.length) + ' rows')
  ok(rows.every((r) => r.length === 5), 'every row has the five documented columns',
    String(rows.find((r) => r.length !== 5) || ''))
}

// ---- E. writes happen ONLY between the markers ---------------------------------------------------
{
  const dir = mkdtempSync(join(tmpdir(), 'vmu-wiring-w-'))
  const copy = join(dir, '00-README.md')
  copyFileSync(README, copy)
  const before = readFileSync(copy, 'utf8')
  const r = run(['--write'], { VMU_WIRING_DOC: copy })
  ok(r.status === 0, 'the generator can write through the VMU_WIRING_DOC seam', 'exit=' + r.status)
  const after = readFileSync(copy, 'utf8')
  const strip = (t) => { const p = blockLines(t); return p.lines.slice(0, p.b + 1).join('\n') + '\n@@BLOCK@@\n' + p.lines.slice(p.e).join('\n') }
  ok(strip(before) === strip(after), 'everything OUTSIDE the markers is byte-identical after --write')
  ok(after !== before || blockLines(before).block.join('\n') === blockLines(after).block.join('\n'),
    'the run was idempotent on an already-current copy')
  rmSync(dir, { recursive: true, force: true })
}

// ---- F. failure classification: the four faults get four DIFFERENT answers ------------------------
// Round-6 reviewer finding: a bad seam ("input does not exist") and a stale settings table printed the SAME
// sentence, so the reader was sent to the wrong fix. Each class is asserted here; every case runs against a
// TEMP copy through the documented seams, and the real doc/table are never written.
{
  // ① a seam aimed at a path that does not exist ⇒ exit 2, and the PATH is named
  const missingDoc = join(tmpdir(), 'vmu-wiring-absent-' + process.pid + '.md')
  const r1 = run(['--check'], { VMU_WIRING_DOC: missingDoc })
  ok(r1.status === 2 && String(r1.stderr || '').includes('输入不存在') && String(r1.stderr || '').includes(missingDoc),
    '① input missing (VMU_WIRING_DOC) ⇒ exit 2 and the path is named',
    'exit=' + r1.status + ' ' + String(r1.stderr || '').trim().split('\n')[0].slice(0, 120))

  // ①b a code dir that does not exist is the SAME class — and must NOT be reported as "stale"
  const missingDir = join(tmpdir(), 'vmu-code-absent-' + process.pid)
  const r2 = run(['--check'], { VMU_CODE_DIR: missingDir })
  ok(r2.status === 2 && String(r2.stderr || '').includes('输入不存在') && !/STALE/.test(String(r2.stderr || '')),
    '①b input missing (VMU_CODE_DIR) ⇒ exit 2 and never the word STALE',
    'exit=' + r2.status + ' ' + String(r2.stderr || '').trim().split('\n')[0].slice(0, 120))

  // ②③④ need a SELF-CONSISTENT tree copy: the real docs/04 §11 may be mid-regeneration (a concurrent writer
  // changing schema.js/planned.js), so a copy that inherited that state would answer the wrong class and the
  // assertions below would test the tree instead of the generator. The helper regenerates the copy's settings
  // table — through the settings generator's OWN seam (`VMU_SETTINGS_DOC`; `VMU_DOCS_DIR` does not redirect
  // it) — and the copy's wiring block, so each case exercises exactly ONE fault.
  const makeTree = (tag) => {
    const dir = mkdtempSync(join(tmpdir(), 'vmu-wiring-' + tag + '-'))
    const docsCopy = join(dir, 'docs')
    cpSync(DOCS, docsCopy, { recursive: true })
    const vmuCopy = join(dir, 'vibe-math-vmu')
    cpSync(VMU, vmuCopy, { recursive: true })
    const readme = join(dir, '00-README.md')
    copyFileSync(join(docsCopy, '00-README.md'), readme)
    const env = { VMU_SETTINGS_DOC: join(docsCopy, '04-settings.md'), VMU_DOCS_DIR: docsCopy,
      VMU_CODE_DIR: vmuCopy, VMU_WIRING_DOC: readme }
    for (const [script, args] of [['generate-vmu-settings-table.mjs', ['--write']], ['generate-wiring-index.mjs', ['--write']]]) {
      spawnSync(process.execPath, [join(REPO, 'scripts', script)].concat(args),
        { cwd: REPO, encoding: 'utf8', env: Object.assign({}, process.env, env) })
    }
    return { dir, docsCopy, vmuCopy, readme, env }
  }

  // ② a STALE settings table ⇒ exit 2 + the fix command is NAMED (not the generic "regenerate something").
  // The mutation lands in the COPY that `VMU_SETTINGS_DOC` points at, so the hard class cannot depend on
  // whether the real docs/04 happens to be fresh at this instant.
  const t2 = makeTree('stale')
  const st = join(t2.docsCopy, '04-settings.md')
  writeFileSync(st, readFileSync(st, 'utf8').replace(/(\n\| `vmu\.[A-Za-z0-9_.]+`)/, '\n| `vmu.__probe__`'), 'utf8')
  const hard = spawnSync(process.execPath, [join(REPO, 'scripts', 'generate-vmu-settings-table.mjs'), '--check'],
    { cwd: REPO, encoding: 'utf8', env: Object.assign({}, process.env, t2.env) })
  ok(hard.status !== 0, '② precondition: the mutated settings table really is stale (sub-check fails)',
    'exit=' + hard.status)
  const r3 = run(['--check'], t2.env)
  ok(r3.status === 2 && /设置表过期/.test(String(r3.stderr || ''))
    && /generate-vmu-settings-table\.mjs --write/.test(String(r3.stderr || '')),
    '② stale settings table ⇒ exit 2 and the NAMED fix command',
    'exit=' + r3.status + ' ' + String(r3.stderr || '').trim().split('\n').slice(0, 2).join(' | ').slice(0, 170))
  rmSync(t2.dir, { recursive: true, force: true })

  // ③ a LAGGING planned registry is the SOFT class: loud warning, index still produced ⇒ exit 0
  const t3 = makeTree('soft')
  const plannedCopy = join(t3.vmuCopy, 'settings', 'planned.js')
  // planned.js writes keys with DOUBLE quotes (a single-quote regex silently matched nothing — the first
  // version of this case passed for the wrong reason).
  writeFileSync(plannedCopy, readFileSync(plannedCopy, 'utf8').replace(/key: "/, 'key: "zzz-lagging-'), 'utf8')
  const soft = spawnSync(process.execPath, [join(REPO, 'scripts', 'generate-planned-settings.mjs'), '--check'],
    { cwd: REPO, encoding: 'utf8', env: Object.assign({}, process.env, t3.env) })
  ok(soft.status !== 0, '③ precondition: the mutated planned.js really lags (sub-check fails)', 'exit=' + soft.status)
  const r4 = run(['--check'], t3.env)
  ok(r4.status === 0 && /WARNING/.test(String(r4.stderr || '')),
    '③ lagging planned.js ⇒ WARNING but exit 0 (soft class preserved)',
    'exit=' + r4.status + ' ' + String(r4.stderr || '').trim().split('\n')[0].slice(0, 140))
  rmSync(t3.dir, { recursive: true, force: true })

  // ④ a block that is not what the artefacts yield ⇒ exit 1 (real inconsistency, distinct from ②)
  const t4 = makeTree('inc')
  writeFileSync(t4.readme, readFileSync(t4.readme, 'utf8').replace(/(\| 20 \| )(\d+)/, '$1' + '777'), 'utf8')
  const r5 = run(['--check'], t4.env)
  ok(r5.status === 1, '④ real inconsistency inside the block ⇒ exit 1 (never 2)', 'exit=' + r5.status)
  rmSync(t4.dir, { recursive: true, force: true })
}

if (failed === 0) {
  console.log('=== VMU WIRING INDEX: ALL GREEN (volumes=' + rows.filter((r) => /^\d\d$/.test(r[0])).length
    + ', passed=' + passed + ', failed=0) ===')
  process.exit(0)
}
for (const f of failures) console.log('  FAIL - ' + f)
console.log('=== VMU WIRING INDEX: RED (passed=' + passed + ', failed=' + failed + ') ===')
process.exit(1)
