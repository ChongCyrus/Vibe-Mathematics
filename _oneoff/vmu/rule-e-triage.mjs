// _oneoff/vmu/rule-e-triage.mjs — ONE-OFF triage for RULE E shape-A hits (task-222/224).
// SINGLE SOURCE OF TRUTH: it does NOT re-implement the detector. It runs the gate itself with
// `--dump-rule-e`, which makes the gate print its un-excused RULE E coverage as JSON, then samples
// deterministically across the highest-hit files and prints each hit WITH context for human triage:
//   ① true vacuous  ✗   ② structurally safe (literal/constant)   ③ empty-set is intended
// Usage: node _oneoff/vmu/rule-e-triage.mjs [sampleSize]
import { spawnSync } from 'node:child_process'

const REPO = 'D:/wd/vibemath开发/Vibe-Mathematics'
const GATE = REPO + '/tests/audit-declaration-criterion.test.mjs'
const size = Number(process.argv[2] || 40)

const run = spawnSync(process.execPath, [GATE, '--dump-rule-e'], { cwd: REPO, encoding: 'utf8', timeout: 600000 })
const line = String(run.stdout || '').split('\n').find((l) => l.startsWith('RULE_E_DUMP '))
if (!line) {
  console.error('triage: the gate did not emit RULE_E_DUMP (exit=' + run.status + ')')
  console.error(String(run.stderr || '').slice(0, 400))
  process.exit(2)
}
const dump = JSON.parse(line.slice('RULE_E_DUMP '.length))
const hits = dump.hits
const shapeA = hits.filter((h) => h.shape === 'A')
console.log('RULE-E un-excused total=' + hits.length + ' (shape A=' + shapeA.length + ', B=' + hits.filter((h) => h.shape === 'B').length + ', C=' + hits.filter((h) => h.shape === 'C').length + ', D=' + hits.filter((h) => h.shape === 'D').length + ')')

const byFile = new Map()
for (const h of shapeA) byFile.set(h.file, (byFile.get(h.file) || []).concat(h))
const order = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length).map(([f]) => f)
const sample = []
let round = 0
while (sample.length < size && round < 50) {
  for (const f of order) { const list = byFile.get(f); if (list[round]) sample.push(list[round]); if (sample.length >= size) break }
  round++
}
for (const s of sample) {
  console.log('--- ' + s.file + ':' + s.line + '  [' + s.shape + ']')
  for (const c of s.ctx) console.log('    ' + c)
}
console.log('SAMPLED=' + sample.length + ' files=' + new Set(sample.map((s) => s.file)).size + ' (source: the gate itself)')
