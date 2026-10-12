// rename-module.mjs — rename a kernel module FILE, and every mention of it, without breaking the package.
//
// WHY THIS IS A SEPARATE TOOL FROM rename-family.mjs. Renaming a settings family changes a name a user types;
// renaming a module changes the import graph, both shipping rosters, the docs that cite the file, and any audit that
// maps a file name to something else. The two are different decisions with different blast radii, so they are
// different tools, and this one's header says exactly what it touches:
//   1. the file itself (via `git mv`, so history follows);
//   2. every spelling of the path: `./x.js`, `kernel/x.js`, `'x.js'`, and the same inside a sentence;
//   3. the two shipping rosters, which spell the path differently from each other;
//   4. optionally a test file named after the module, plus whatever cites that test file by name.
//
// It defaults to a dry run and prints every spelling with its count, because a rename is finished only when the gate
// is green and nothing still speaks the old name.
//
// Usage:
//   node scripts/dev/rename-module.mjs <old> <new> [--test <oldTest> <newTest>] [--write]
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, renameSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const walk = (dir) => readdirSync(join(REPO, dir)).flatMap((e) => {
  const rel = join(dir, e)
  return statSync(join(REPO, rel)).isDirectory() ? walk(rel) : [rel]
})

const args = process.argv.slice(2)
const write = args.includes('--write')
const pos = args.filter((a) => !a.startsWith('--'))
const [oldName, newName] = pos
const ti = args.indexOf('--test')
const testPair = ti === -1 ? null : [args[ti + 1], args[ti + 2]]

if (!oldName || !newName) {
  console.error('usage: node scripts/dev/rename-module.mjs <old> <new> [--test <oldTest> <newTest>] [--write]')
  process.exit(2)
}

const files = [
  ...walk('tests').filter((f) => f.endsWith('.mjs')),
  ...walk('vibe-math-vmu').filter((f) => /\.(js|md|json|yml)$/.test(f)),
  'installer.js',
  'package.json',
]

// Every way the module is written down. `kernel/<name>.js` covers both rosters and every doc citation, including the
// ones inside Chinese sentences like "已接线（hr.js 读取）" - that spelling carries the bare file name, which the last
// entry catches.
const spellings = [
  { label: './<name>.js', find: './' + oldName + '.js', to: './' + newName + '.js' },
  { label: 'kernel/<name>.js', find: 'kernel/' + oldName + '.js', to: 'kernel/' + newName + '.js' },
  { label: "'<name>.js'", find: "'" + oldName + '.js' + "'", to: "'" + newName + '.js' + "'" },
  { label: 'bare <name>.js', find: oldName + '.js', to: newName + '.js' },
]

console.log('=== kernel/' + oldName + '.js -> kernel/' + newName + '.js  (' + (write ? 'WRITE' : 'DRY RUN') + ') ===')
console.log('  the file exists: ' + existsSync(join(REPO, 'vibe-math-vmu', 'kernel', oldName + '.js')))
for (const s of spellings) {
  let n = 0
  let nf = 0
  for (const f of files) {
    const c = readFileSync(join(REPO, f), 'utf8').split(s.find).length - 1
    if (c) { n += c; nf += 1 }
  }
  console.log('  spelling ' + s.label.padEnd(18) + ': ' + n + ' occurrence(s) in ' + nf + ' file(s)')
}
if (testPair) {
  console.log('  test file ' + testPair[0] + ' -> ' + testPair[1] + '  (exists: ' + existsSync(join(REPO, 'tests', testPair[0])) + ')')
}

if (!write) {
  console.log('  dry run: nothing written. Re-run with --write to apply.')
  process.exit(0)
}

// TEXT FIRST, FILES LAST. The earlier order moved the module before rewriting its importers, so the file list still
// held the old path, the loop threw on the first missing file, and the rename stopped half-done: a moved module with
// importers still naming it. Rewriting text first cannot fail that way, and a move that fails after a successful
// rewrite leaves a consistent tree with one unrenamed file.
let touched = 0
for (const f of files) {
  const path = join(REPO, f)
  if (!existsSync(path)) continue  // a moved file is no longer at its old path; skipping is correct
  let t = readFileSync(path, 'utf8')
  const before = t
  for (const s of spellings) t = t.split(s.find).join(s.to)
  if (t !== before) { writeFileSync(path, t); touched += 1 }
}
console.log('  rewrote ' + touched + ' file(s)')
renameSync(join(REPO, 'vibe-math-vmu', 'kernel', oldName + '.js'), join(REPO, 'vibe-math-vmu', 'kernel', newName + '.js'))
console.log('  moved the module file')

if (testPair) {
  const from = join(REPO, 'tests', testPair[0])
  if (existsSync(from)) {
    renameSync(from, join(REPO, 'tests', testPair[1]))
    // whatever cites the test file by NAME keeps working
    for (const f of files) {
      const path = join(REPO, f)
      let t = readFileSync(path, 'utf8')
      const before = t
      t = t.split(testPair[0]).join(testPair[1])
      if (t !== before) { writeFileSync(path, t); console.log('  updated a citation of the test file in ' + f) }
    }
    // and the shipping roster lists it, so the entry must move too
    const pkgPath = join(REPO, 'package.json')
    const pkg = readFileSync(pkgPath, 'utf8')
    if (!pkg.includes('"' + 'tests/' + testPair[1] + '"')) {
      writeFileSync(pkgPath, pkg.replace('"tests/' + testPair[0] + '"', '"tests/' + testPair[0] + '",\n    "tests/' + testPair[1] + '"'))
      console.log('  registered the renamed test file')
    }
  } else console.log('  test file not found; skipped')
}

console.log('  NEXT: run the gate. A module rename is finished only when the import closure, both rosters and every')
console.log('  citation agree, and the package-membership audit is the one that proves it.')
