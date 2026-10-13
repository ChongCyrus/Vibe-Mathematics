// tests/audit-pack-face.test.mjs - every file inside a pack folder must be named in the volume that documents pack folders.
//
// WHY. docs/27 documents the pack-folder layout, which is the acceptance surface of goal 2. A round earlier I split
// v5r-blocks.js into v5r-blocks-a.js and v5r-blocks-b.js to satisfy the size gate, the pack kept working, and the volume kept
// describing it as one file - a module that had been taken apart while the documentation still called it whole. The guard reads
// the directory and the volume and requires every file to be named, and it checks the other direction too: a file the volume
// names must exist, so the layout cannot be described from memory.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const PACKS = join(REPO, 'vibe-math-vmu', 'packs')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = join(d, e.name)
  return e.isDirectory() ? walk(p) : [p]
})
const volume = readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '27-pack-folder.md'), 'utf8')

console.log('=== 1. THE PACK DIRECTORIES ARE READ ===')
const packs = readdirSync(PACKS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
ok(packs.length >= 3, 'the pack folders are found', { packs })

console.log('=== 2. EVERY FILE IN EVERY PACK IS NAMED IN THE PACK-FOLDER VOLUME ===')
const unnamed = []
for (const p of packs) {
  for (const f of walk(join(PACKS, p))) {
    const base = f.split(/[\\/]/).pop()
    if (!volume.includes(base)) unnamed.push(p + '/' + base)
  }
}
ok(unnamed.length === 0,
  'every file in every pack is named where the pack folder is documented, so the layout cannot drift from the description',
  { unnamed })

console.log('=== 3. AND EVERY FILE THE VOLUME NAMES IN A PACK REALLY EXISTS ===')
// names of the form `something.js` or `something.json` cited in the volume
const cited = [...new Set([...volume.matchAll(/`([\w-]+\.(?:js|json))`/g)].map((m) => m[1]))]
const allFiles = new Set(packs.flatMap((p) => walk(join(PACKS, p)).map((f) => f.split(/[\\/]/).pop())))
// the volume also legitimately names framework files (package.json, installer.js); only pack-scoped names are required to be
// present, so the check is limited to names that appear in a pack-ish context - asserted below by non-emptiness of `allFiles`.
// HISTORICAL MENTIONS ARE NOT PROMISES. A line that says a file 曾是一个 other file is recording a past split; requiring
// that past name to exist would forbid the very note that explains the layout. Exempt citations whose line contains 曾, and
// assert the exemption is declared somewhere in the volume so it cannot silently widen.
const lines = volume.split('\n').filter((l) => /曾/.test(l))
ok(lines.length > 0, 'the volume declares at least one historical mention, which is what the exemption below rests on', { lines: lines.length })
const historical = new Set()
for (const l of lines) for (const m of l.matchAll(/`([\w-]+\.(?:js|json))`/g)) historical.add(m[1])
const missing = cited.filter((c) => !allFiles.has(c) && !historical.has(c) && /^(v5r-|defaults\.)/.test(c))
ok(missing.length === 0, 'and every v5r- or defaults-named file the volume cites exists in a pack', { missing })
ok(allFiles.size >= 8, 'the pack file set is non-trivial, so the checks above are not vacuous', { files: allFiles.size })

console.log('=== PACK FACE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
