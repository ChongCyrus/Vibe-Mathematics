// Registered mutant harness for tests/audit-path-discipline.mjs - the audit carries its own proof.
// One mutant per assertion family; each MUST make the audit fail, otherwise the guard does not bite.
// Usage: node tests/audit-path-discipline.mutants.mjs   (exit 0 = every family reddened)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, mkdtempSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..')
const audit = join(here, 'audit-path-discipline.mjs')
// Unique per run (audit C: a fixed repo-local dir could collide with a concurrent run and dirtied the tree)
const tmp = mkdtempSync(join(tmpdir(), 'audit-mutants-'))
const families = [
  { name: 'v4-text-shape (delivered declaration re-prefixed)', preset: 'vibe-math-v4', env: 'V4_PLUGIN',
    from: "+'  Propos/<" + String.fromCharCode(20320) + ">/<id>.md",
    to: "+'  Members/<" + String.fromCharCode(20320) + ">/Propos/<" + String.fromCharCode(20320) + ">/<id>.md",
    expect: /no Members\/ occurrence at all/ },
  { name: 'v4-literal-members (widened Members/ predicate)', preset: 'vibe-math-v4', env: 'V4_PLUGIN',
    from: "/Propos/r-1/p-1.md", to: "/Members/r-1/Propos/p-1.md",
    expect: /no Members\/ occurrence at all/ },
  { name: 'v3-writer-whitelist class guard (Members/ reintroduced)', preset: 'vibe-math-v3', env: 'V3_PLUGIN',
    from: '(^|[^/>])(Propos)\\/<([^>]+)>\\/', to: '$1Members/<$3>/$2/<$3>/', regex: true,
    expect: /v3: no Members\// },
  { name: 'v2 PAPER_PATH_NOTE structure (digest append dropped)', preset: 'vibe-math-v2', env: 'V2_PLUGIN',
    from: '    L.push(PAPER_PATH_NOTE)', to: '', expect: /delivered digest material appends PAPER_PATH_NOTE/ },
]
mkdirSync(tmp, { recursive: true })
let ok = 0, bad = 0
try {
for (const f of families) {
  const src = join(repo, f.preset, f.preset + '.js')
  let t = readFileSync(src, 'utf8')
  const hits = f.regex ? (t.match(new RegExp(f.from, 'm')) || []).length : t.split(f.from).length - 1
  if (hits < 1) { console.error('  NO-OP - ' + f.name + ' (predicate did not match)'); bad++; continue }
  t = f.regex ? t.replace(new RegExp(f.from, 'm'), f.to) : t.split(f.from).join(f.to)
  const out = join(tmp, f.preset + '.js')
  writeFileSync(out, t, 'utf8')
  let red = false, msg = ''
  try {
    execFileSync(process.execPath, [audit], { env: Object.assign({}, process.env, { [f.env]: out }), encoding: 'utf8' })
  } catch (e) { red = true; msg = String((e && (e.stdout || '')) + (e && (e.stderr || ''))) }
  const named = f.expect.test(msg)
  if (red && named) { ok++; console.log('  ok - ' + f.name + ' reddened the audit by name') }
  else { bad++; console.error('  FAIL - ' + f.name + ' red=' + red + ' named=' + named + ' :: ' + msg.split('\n').filter((l) => l.includes('FAIL')).slice(0, 1).join('')) }
}
} finally { rmSync(tmp, { recursive: true, force: true }) }
console.log('')
console.log('mutant families reddening the audit: ' + ok + '/' + families.length)
if (bad) process.exit(1)
console.log('ALL FAMILIES BITE')