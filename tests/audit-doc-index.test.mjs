// tests/audit-doc-index.test.mjs - the index must name every volume that exists, and no volume that does not.
//
// WHY THIS EXISTS. docs/00 omitted SIX volumes - 23 through 28 - that were sitting on disk. A reader who trusts an index
// cannot know what it does not list, which makes an incomplete index worse than no index: it converts absence into
// invisibility. The guard is cheap and general: read the directory, read the appendix table, compare both ways.
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

const onDisk = readdirSync(DOCS).filter((f) => /^\d\d-.*\.md$/.test(f)).sort()
const index = readFileSync(join(DOCS, '00-README.md'), 'utf8')

console.log('=== 1. THE DIRECTORY IS READ ===')
ok(onDisk.length >= 20, 'the volume directory is read', { volumes: onDisk.length })

console.log('=== 2. EVERY VOLUME IS NAMED IN THE INDEX ===')
const unlisted = onDisk.filter((f) => !index.includes(f.replace('.md', '')))
ok(unlisted.length === 0,
  'every volume on disk is named in the README, because an index that omits a volume turns that volume invisible',
  { unlisted })

console.log('=== 3. AND THE INDEX DOES NOT CITE A VOLUME THAT IS GONE ===')
// names of the form NN-something cited in the README that do not exist
// ONLY names that LOOK like a volume stem: NN-<name> where <name> is a real volume s shape. A design document cited as
// 03-containment lives in _oneoff and is not a volume, so treating every NN-name as one produced phantom failures.
const volumeStems = new Set(onDisk.map((f) => f.replace('.md', '')))
const cited = [...new Set([...index.matchAll(/`(\d\d-[a-z0-9-]{4,})`/g)].map((m) => m[1]))]
// a citation is phantom only if it shares a volume s numbering AND its stem matches the pattern of a real volume name
const phantom = cited.filter((n) => !volumeStems.has(n) && /^\d\d-(agent|interface|settings|middleware|prompt|durability|primitives|formalization|packs|gates|command|plugin|pack-security|observability|academic|extensions|v5r|demoted|turn|pack-folder|decision|user-guide|math|research)/.test(n))
ok(phantom.length === 0, 'and it cites no volume that does not exist', { phantom })

console.log('=== 4. THE APPENDIX TABLE EXISTS AND SAYS WHY ===')
ok(/全部卷清单/.test(index), 'the README carries an explicit volume list rather than relying on prose mentions')
ok(/漏列了 \d+ 卷/.test(index), 'and it records that it used to omit volumes, which is the fact that makes the guard worth having')

console.log('=== DOC INDEX: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
