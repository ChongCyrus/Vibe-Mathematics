// scripts/generate-preset-roster.mjs - render the docs/27 tables of the ONE preset roster, and verify the roster's edges.
//
// WHY THIS EXISTS (TB-2792 / C#6, five audit rounds FAIL). The shipped/installed file roster lived in TWO hand-written
// places: `installer.js`'s `PRESETS[].files` and the tables in `docs/27-pack-folder.md`. Every round that added a preset
// file (this round: `packs/research-core/*`) had to edit both, and rounds 4-8 caught the drift. The list is now ONE data
// file - `vibe-math-vmu/roster.json` - read by `installer.js` at startup; this generator derives the documentation table
// from that SAME data, and the checks below make a drifting roster a NAMED failure instead of a second copy nobody reads:
//
//   · every roster entry must SHIP (be listed in package.json#files as `<src>/<file>`),
//   · every roster entry must EXIST on disk under its `src` root,
//   · the roster must not describe the same file twice, and must stay inside its src root (no absolute paths / `..`),
//   · the docs/27 generated block must be what the roster yields (that is the `--check` byte comparison below).
//
//   node scripts/generate-preset-roster.mjs           (no flag: dry run, report only)
//   node scripts/generate-preset-roster.mjs --check    (same report, exit 1 when anything is stale/unsafe)
//   node scripts/generate-preset-roster.mjs --write
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exitCodeFor, modeFrom } from './_lib/generator-cli.mjs'
import { validatePresetRoster, readPresetRoster, PRESET_ROSTER_PATH } from '../installer.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ROSTER = PRESET_ROSTER_PATH
const PKG = join(REPO, 'package.json')
const DOC = join(REPO, 'vibe-math-vmu', 'docs', '27-pack-folder.md')
const MODE = modeFrom(process.argv, { script: 'generate-preset-roster.mjs' })
const BEGIN = '<!-- BEGIN GENERATED: preset-roster -->'
const END = '<!-- END GENERATED: preset-roster -->'

const fail = (items) => {
  for (const item of items) console.error('preset-roster: ' + item)
  process.exit(MODE === 'read' ? 0 : 1)
}

// ---- 1. THE ONE SOURCE, VALIDATED (schema comes from installer.js: one definition, no second opinion) --------------
let data = null
try { data = JSON.parse(readFileSync(ROSTER, 'utf8')) } catch (e) {
  fail(['the roster ' + ROSTER + ' cannot be read as JSON: ' + String((e && e.message) || e)])
}
const schemaCheck = validatePresetRoster(data)
if (!schemaCheck.ok) fail(schemaCheck.problems.map((p) => 'roster schema: ' + p))

// ---- 2. THE EDGES OF THE ONE SOURCE: shipped + exists + safe ---------------------------------------------------------
const pkg = JSON.parse(readFileSync(PKG, 'utf8'))
const shipped = new Set(Array.isArray(pkg.files) ? pkg.files : [])
const problems = []
const rosterSelf = 'vibe-math-vmu/roster.json'
if (!shipped.has(rosterSelf)) problems.push('the roster itself must ship: package.json#files is missing "' + rosterSelf + '"')
for (const preset of data.presets) {
  const srcRoot = join(REPO, preset.src)
  if (!existsSync(srcRoot)) problems.push(preset.id + ': src root does not exist: ' + preset.src)
  for (const file of preset.files) {
    const shippedPath = preset.src + '/' + file
    if (!shipped.has(shippedPath)) problems.push(preset.id + ': ' + file + ' is managed but NOT shipped (package.json#files is missing "' + shippedPath + '")')
    if (!existsSync(join(srcRoot, file))) problems.push(preset.id + ': ' + file + ' is managed but MISSING on disk under ' + preset.src + '/')
    if (file.includes('..') || file.startsWith('/') || file.startsWith('\\') || file.includes(':')) problems.push(preset.id + ': ' + file + ' escapes its src root')
  }
}
if (problems.length) fail(problems)

// ---- 3. RENDER: the docs/27 block, derived from the roster -----------------------------------------------------------
const groups = (preset) => {
  const map = new Map()
  for (const file of preset.files) {
    const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : ''
    const base = file.slice(file.lastIndexOf('/') + 1)
    const key = dir === '' ? '（根）' : '`' + dir + '/`'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(base)
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] === '（根）' ? -1 : b[0] === '（根）' ? 1 : a[0].localeCompare(b[0])))
    .map(([dir, names]) => ({ dir, names: names.slice().sort() }))
}
const countOf = (preset, re) => preset.files.filter((f) => re.test(f)).length
const lines = [
  BEGIN,
  '',
  '### 6.6 ★★★ 唯一真源：`vibe-math-vmu/roster.json`（**生成表，禁手改** ✓）',
  '',
  '★★ **本表由 `scripts/generate-preset-roster.mjs` 从真源 `vibe-math-vmu/roster.json` 生成** ✓（★ `regen-all --check` 的硬门之一 ✓）。',
  '★★★ **改一处真源 ⇒ 两条边同时变** ✓：`installer.js` 的 `PRESETS[].files` **不再手写第二份**，启动时**直接读这份数据** ✓；本表与它同源 ✓。',
  '★★ **两条边仍然分开** ✓：**shipped 边**＝`package.json#files`（进 tarball ✓）；**托管边**＝本表（`installer.js` 复制进 `.agent-presets/<id>/` ✓）。生成器校验**托管 ⊆ shipped、每个托管文件在磁盘上存在、无重复、不越出 src 根** ⇒ ★ **旧缺陷（加一个文件只改一处）现在是具名红灯** ✓，不是靠人记得改两处 ✓。',
  '',
  '| preset | src → dst | 托管文件数 | `.js` | `.json` | `.md` | `.yml` | 其他 |',
  '|---|---|---|---|---|---|---|---|',
  ...data.presets.map((p) => '| `' + p.id + '` | `' + p.src + '` → `' + p.dst + '` | **' + p.files.length + '** | '
    + countOf(p, /\.js$/) + ' | ' + countOf(p, /\.json$/) + ' | ' + countOf(p, /\.md$/) + ' | ' + countOf(p, /\.ya?ml$/) + ' | '
    + (p.files.length - countOf(p, /\.js$/) - countOf(p, /\.json$/) - countOf(p, /\.md$/) - countOf(p, /\.ya?ml$/)) + ' |'),
  '',
]
for (const preset of data.presets) {
  lines.push('#### `' + preset.id + '` 文件清单（按目录分组，组内按名排序 ✓）', '')
  lines.push('| 目录 | 文件 |')
  lines.push('|---|---|')
  for (const g of groups(preset)) lines.push('| ' + g.dir + ' | ' + g.names.map((n) => '`' + n + '`').join('、') + ' |')
  lines.push('')
}
lines.push('> ★★ **本块由生成器拥有**：`<!-- BEGIN GENERATED: preset-roster -->` 之间的内容**不许手改** ✓ —— 改真源后跑 `node scripts/generate-preset-roster.mjs --write` ✓；★ 门禁：`tests/audit-installer-policy.test.mjs §8`（PRESETS **等于** roster）与 `tests/audit-package-membership.mjs`（roster ⊆ shipped）✓。')
lines.push('')
lines.push(END)
const block = lines.join('\n')

const doc = readFileSync(DOC, 'utf8')
const a = doc.indexOf(BEGIN)
const b = doc.indexOf(END)
if (a < 0 || b < 0) {
  console.error('preset-roster: the generated block markers are missing from ' + DOC)
  console.error('  add "' + BEGIN + '" and "' + END + '" around the roster tables once, then run --write')
  process.exit(MODE === 'read' ? 0 : 2)
}
const next = doc.slice(0, a) + block + doc.slice(b + END.length)
const summary = 'preset-roster: docs/27 == roster (' + data.presets.length + ' preset, '
  + data.presets.reduce((n, p) => n + p.files.length, 0) + ' managed files, all shipped and on disk)'
if (MODE === 'write') {
  writeFileSync(DOC, next)
  writeFileSync(ROSTER, JSON.stringify(data, null, 2) + '\n')
  console.log('preset-roster: written (' + data.presets.length + ' preset, ' + data.presets.reduce((n, p) => n + p.files.length, 0) + ' managed files)')
} else {
  const stale = doc !== next
  if (stale) {
    console.error('preset-roster: docs/27 is STALE - run node scripts/generate-preset-roster.mjs --write'
      + (MODE === 'read' ? ' (dry run: nothing written)' : ''))
  } else {
    console.log(summary)
  }
  process.exit(exitCodeFor(MODE, stale))
}
