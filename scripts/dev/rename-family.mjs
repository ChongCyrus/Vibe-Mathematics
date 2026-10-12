// rename-family.mjs — rename a `vmu.<family>.*` key family WITHOUT breaking anyone.
//
// WHY THIS EXISTS. A name is not one string; it is every way it is written down. Two rounds have now paid for that
// lesson: a sibling import that looked like a path but was a declared metadata value, and a docs mutant that targeted
// the renamed key with a regex-ESCAPED spelling a literal replacement could not see. So this tool does three things a
// one-line replace does not:
//   1. it counts every SPELLING it knows (key literal, regex-escaped, bare-quoted, and the raw substring) and prints
//      them, so an unhandled spelling is visible BEFORE anything changes;
//   2. it defaults to a DRY RUN and requires --write, so a rename cannot happen by accident;
//   3. it records the former name on each declaration as `was: [...]`, which is what makes the rename resolvable at
//      runtime through the channel in settings/schema.js (SETTING_ALIASES / resolveKey / renameNotice).
//
// WHAT IT DELIBERATELY DOES NOT DO: rename a kernel module FILE. A file rename touches the import closure, the two
// shipping rosters and every citation, and it is a separate decision from "the name a user types". Families with a
// same-named kernel file are therefore reported and left for a manual pass.
//
// Usage:
//   node scripts/dev/rename-family.mjs <old> <new> [--write]
//   node scripts/dev/rename-family.mjs slo quality          # dry run
//   node scripts/dev/rename-family.mjs slo quality --write  # apply
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCHEMA = 'vibe-math-vmu/settings/schema.js'

const walk = (dir) => readdirSync(join(REPO, dir)).flatMap((e) => {
  const rel = join(dir, e)
  return statSync(join(REPO, rel)).isDirectory() ? walk(rel) : [rel]
})

function targets() {
  return [
    ...walk('tests').filter((f) => f.endsWith('.mjs')),
    ...walk('vibe-math-vmu').filter((f) => /\.(js|md|json|yml)$/.test(f)),
    'installer.js',
    'package.json',
  ]
}

function spellings(family) {
  return [
    { label: 'key literal', find: 'vmu.' + family + '.', replace: (n) => 'vmu.' + n + '.' },
    { label: 'key escaped', find: 'vmu\\.' + family + '\\.', replace: (n) => 'vmu\\.' + n + '\\.' },
    { label: 'bare quoted', find: "'" + family + "'", replace: (n) => "'" + n + "'" },
    { label: 'bare dquoted', find: '"' + family + '"', replace: (n) => '"' + n + '"' },
    // a family with NO trailing dot is how a measured table names it: `vmu.outreach` rather than a key.
    { label: 'family bare', find: 'vmu.' + family, replace: (n) => 'vmu.' + n },
  ]
}

const args = process.argv.slice(2)
const write = args.includes('--write')
const [oldName, newName] = args.filter((a) => !a.startsWith('--'))
if (!oldName || !newName) {
  console.error('usage: node scripts/dev/rename-family.mjs <old> <new> [--write]')
  process.exit(2)
}

// A path comparison must normalise separators: walk() yields the OS separator, while the constant above is
// written POSIX-shaped, so a strict `===` silently never matched and `was:` was never recorded. Two rounds now show
// that the second spelling of a name is where renames go wrong; this is the same lesson in path form.
const isSchema = (f) => f.split('\\').join('/') === SCHEMA

const files = targets()
const schema = readFileSync(join(REPO, SCHEMA), 'utf8')
const keys = [...schema.matchAll(new RegExp("key: 'vmu\\." + oldName + "\\.([A-Za-z0-9_]+)'", 'g'))].map((m) => m[1])
const docs = [...schema.matchAll(new RegExp("key: 'vmu\\." + oldName + "\\.[A-Za-z0-9_]+'[^}]*doc: '([^']*)'", 'g'))].map((m) => m[1])

console.log('=== vmu.' + oldName + '.* -> vmu.' + newName + '.*  (' + (write ? 'WRITE' : 'DRY RUN') + ') ===')
console.log('  declarations: ' + keys.length)
for (let i = 0; i < keys.length; i++) console.log('    vmu.' + oldName + '.' + keys[i] + '   — ' + (docs[i] || ''))
if (!keys.length) console.log('  NOTE: no declarations found under this family.')

const sameNamedKernelFile = existsSync(join(REPO, 'vibe-math-vmu', 'kernel', oldName + '.js'))
console.log('  a kernel file carries this name: ' + sameNamedKernelFile +
  (sameNamedKernelFile ? '  (FILE RENAMES ARE OUT OF SCOPE HERE - see the header)' : ''))

for (const s of spellings(oldName)) {
  let n = 0
  let nf = 0
  for (const f of files) if (readFileSync(join(REPO, f), 'utf8').split(s.find).length - 1) { n += readFileSync(join(REPO, f), 'utf8').split(s.find).length - 1; nf += 1 }
  console.log('  spelling "' + s.label + '": ' + n + ' occurrence(s) in ' + nf + ' file(s)')
}

if (!write) {
  console.log('  dry run: nothing written. Re-run with --write to apply, and remember the two shipping rosters are')
  console.log('  already covered by the file list above.')
  process.exit(0)
}

let touched = 0
for (const f of files) {
  const path = join(REPO, f)
  let t = readFileSync(path, 'utf8')
  const before = t
  if (isSchema(f)) {
    // record the former name on each declaration BEFORE the blanket replacement, so `was` keeps the OLD spelling
    for (const k of keys) {
      t = t.split("key: 'vmu." + oldName + "." + k + "'").join("key: 'vmu." + newName + "." + k + "', was: ['vmu." + oldName + "." + k + "']")
    }
  }
  for (const s of spellings(oldName)) t = t.split(s.find).join(s.replace(newName))
  if (isSchema(f)) {
    // the blanket replacement rewrote the former names inside `was`; put them back
    for (const k of keys) t = t.split("was: ['vmu." + newName + "." + k + "']").join("was: ['vmu." + oldName + "." + k + "']")
  }
  if (t !== before) { writeFileSync(path, t); touched += 1 }
}
console.log('  written: ' + touched + ' file(s)')
console.log('  NEXT: run the gate. A rename is not finished until the gate is green and the docs status tables agree.')
