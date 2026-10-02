#!/usr/bin/env node
/**
 * Regenerate the count sentences quoted by shipped docs FROM THE TREE (D1: derive, don't type).
 *
 *   node scripts/update-doc-counts.mjs          # rewrite in place
 *   node scripts/update-doc-counts.mjs --check  # exit 1 if anything would change (converges: whole-line rewrites)
 *
 * Authority: `node tests/run-tests.mjs --counts` (the gate's own JOB list) + `package.json#files`
 * (shipped FILE counts). Shapes come from tests/helpers/doc-counts-format.mjs, shared with the guard
 * (tests/audit-readme-counts.mjs) and its mutant harness. Adding a test file reddens the guard; the fix
 * is to run this script. Whole lines are rebuilt (no partial regex edits), so a corrupted previous
 * shape is repaired rather than half-matched.
 *
 * Grep anchors: update-doc-counts, doc-counts-format.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { claims, MARKERS } from '../tests/helpers/doc-counts-format.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const checkOnly = process.argv.includes('--check')

const derived = JSON.parse(spawnSync(process.execPath, [join(REPO, 'tests', 'run-tests.mjs'), '--counts'], { cwd: REPO, encoding: 'utf8' }).stdout.trim())
const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'))
const shippedFiles = pkg.files.filter((f) => f.startsWith('tests/') && f.endsWith('.mjs'))
const shipped = { total: shippedFiles.length, suites: shippedFiles.filter((f) => f.endsWith('.test.mjs')).length }
shipped.probes = shipped.total - shipped.suites
const c = claims(derived, shipped)

function replaceLine(text, marker, canonical) {
  const lines = text.split(/\r?\n/)
  const i = lines.findIndex((l) => l.indexOf(marker) !== -1)
  if (i === -1) return null
  if (lines[i] === canonical) return text
  lines[i] = canonical
  return lines.join(text.includes('\r\n') ? '\r\n' : '\n')
}

const log = []
let changed = 0
const apply = (file, fn) => {
  const p = join(REPO, file)
  const before = readFileSync(p, 'utf8')
  const after = fn(before)
  if (after === null) { log.push('MARKER MISS: ' + file); return }
  if (after !== before) {
    changed++
    if (checkOnly) log.push('WOULD CHANGE ' + file)
    else { writeFileSync(p, after); log.push('updated ' + file) }
  }
}

apply('README.md', (s) => replaceLine(s, MARKERS.zhBullet, c.zhBullet))
apply('README.en.md', (s) => replaceLine(s, MARKERS.enBullet, c.enBullet))
apply('docs/test-timing.md', (s) => replaceLine(s, MARKERS.ttRow, c.ttRow))
apply('docs/AUDIT-CHECKLIST.md', (s) => {
  let out = replaceLine(s, MARKERS.d1Row, c.d1Row)
  if (out === null) return null
  out = out.replace(/\d+ 项作业（job count）= \d+ 套件 \+ \d+ 探针\/变体/, c.ckClaim)
  out = out.replace(/只发 `tests\/` 的 \*\*\d+[^*]*\*\*（[^）]*）/, c.ckShipped)
  return out
})

log.push((checkOnly ? 'check: ' : '') + 'derived JOBS total=' + derived.total + ' suites=' + derived.suites + ' probes=' + derived.probes
  + ' | shipped FILES tests/*.mjs=' + shipped.total + ' (' + shipped.suites + ' suites + ' + shipped.probes + ' probes/scripts)'
  + ' | files changed=' + changed)
console.log(log.join('\n'))
process.exit(checkOnly && changed ? 1 : 0)
