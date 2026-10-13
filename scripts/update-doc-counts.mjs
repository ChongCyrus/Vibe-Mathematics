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
// THE SCOPED COUNT IS DERIVED THE SAME WAY, from the gate's own list under the scope the docs quote. Two spawns of
// `--counts` are cheap (it prints the job list and runs nothing), and deriving it is the whole point.
let scoped = null
try {
  const r = spawnSync(process.execPath, [join(REPO, 'tests', 'run-tests.mjs'), '--counts'], { cwd: REPO, encoding: 'utf8', env: Object.assign({}, process.env, { GATE_SCOPE: 'vmu' }) })
  const parsed = JSON.parse(String(r.stdout || '').trim())
  // `--counts` IS DELIBERATELY SCOPE-INDEPENDENT, and this guard is here because that is easy to mistake for a bug.
  // The runner says why: documented counts are properties of the REPOSITORY, not of an edit loop, so a scope that
  // narrowed them would make the docs depend on how the run was invoked and would break every guard that spawns the
  // runner as a child. The consequence for THIS script is that the number it can derive is the repository job count
  // (the repository job count), which is NOT the vmu-subset count a reader of the gate volume is asking for - and the number
// itself is deliberately NOT written here, because a comment quoting a count goes stale exactly like prose does. Run
// `node tests/run-tests.mjs --counts` for it. A
  // generator that cannot answer a question must not answer it wrongly, so a scoped count equal to the full one is
  // refused and the line is left to the number a run actually prints.
  if (parsed && Number.isInteger(parsed.total) && parsed.total !== derived.total) scoped = { total: parsed.total, suites: parsed.suites, probes: parsed.probes }
  else if (parsed && parsed.total === derived.total) process.stderr.write('update-doc-counts: --counts is scope-independent BY DESIGN (it returned the repository job count ' + parsed.total + '), which is not the scoped count, so the scoped line is NOT generated\n')
} catch (e) {
  // `log` is declared further down, so a failure here cannot use it; a scoped count that cannot be derived must be
  // VISIBLE rather than silent, because the line it feeds is one of the two that drifted for years.
  process.stderr.write('update-doc-counts: scoped count unavailable: ' + String(e && e.message) + '\n')
}
const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'))
const shippedFiles = pkg.files.filter((f) => f.startsWith('tests/') && f.endsWith('.mjs'))
const shipped = { total: shippedFiles.length, suites: shippedFiles.filter((f) => f.endsWith('.test.mjs')).length }
shipped.probes = shipped.total - shipped.suites
const c = claims(derived, shipped, scoped)

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

// THE GATE VOLUME'S TWO LINES, which were typed by hand until now and had drifted in the one place a reader looks to
// learn how big the gate is. `v11Scoped` is left alone when the scoped count could not be derived, so a failure shows up
// as MARKER MISS rather than as a silently removed line.
apply('vibe-math-vmu/docs/11-gates-and-development.md', (s) => replaceLine(s, MARKERS.v11Shipped, c.v11Shipped))
if (c.v11Scoped) apply('vibe-math-vmu/docs/11-gates-and-development.md', (s) => replaceLine(s, MARKERS.v11Scoped, c.v11Scoped))
else process.stderr.write('update-doc-counts: the scoped line for docs/11 was NOT rewritten (no scoped count)\n')
apply('README.md', (s) => replaceLine(s, MARKERS.zhBullet, c.zhBullet))
apply('README.en.md', (s) => replaceLine(s, MARKERS.enBullet, c.enBullet))
apply('docs/test-timing.md', (s) => replaceLine(s, MARKERS.ttRow, c.ttRow))
apply('docs/AUDIT-CHECKLIST.md', (s) => {
  let out = replaceLine(s, MARKERS.d1Row, c.d1Row)
  if (out === null) return null
  out = out.replace(/\d+ 项作业（job count）= \d+ 套件 \+ \d+ 探针\/变体/, c.ckClaim)
  out = out.replace(/只发 `tests\/` 的 .*?（[^）]*）/, c.ckShipped)
  return out
})

log.push((checkOnly ? 'check: ' : '') + 'derived JOBS total=' + derived.total + ' suites=' + derived.suites + ' probes=' + derived.probes
  + ' | shipped FILES tests/*.mjs=' + shipped.total + ' (' + shipped.suites + ' suites + ' + shipped.probes + ' probes/scripts)'
  + ' | files changed=' + changed)
console.log(log.join('\n'))
process.exit(checkOnly && changed ? 1 : 0)
