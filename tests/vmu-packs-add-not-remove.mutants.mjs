// tests/vmu-packs-add-not-remove.mutants.mjs — the two-way falsification for the add-not-remove assertions.
// Each mutation runs on a COPY of the repo (never the real tree); the pristine copy is the control.
//   M-A settings cannot ADD  -> the ADD arm must redden
//   M-R settings CAN remove  -> the REMOVE-ATTEMPT arm must redden
//   M-B both-declared loads twice / source flips -> the BOTH arm must redden
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const TEST = 'tests/vmu-packs-add-not-remove.test.mjs'
const H = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16).toUpperCase()
const copyRepo = () => {
  const d = mkdtempSync(join(tmpdir(), 'vmu-anr-'))
  for (const part of ['vibe-math-vmu', 'tests', 'package.json', 'scripts']) {
    try { cpSync(join(REPO, part), join(d, part), { recursive: true, filter: (s) => !/node_modules|[\\/]\.git[\\/]/.test(s) }) } catch { /* optional */ }
  }
  return d
}
const runTest = (dir) => {
  try { const out = execFileSync(process.execPath, [TEST], { cwd: dir, encoding: 'utf8', timeout: 300000 }); return { code: 0, s: (out.match(/=== VMU PACKS.*===/) || [''])[0] } }
  catch (e) { const out = String(e.stdout || '') + String(e.stderr || ''); return { code: e.status === undefined ? 'threw' : e.status, s: (out.match(/=== VMU PACKS.*===/) || [''])[0], fails: out.split('\n').filter((l) => /FAIL/.test(l)).map((l) => l.trim().slice(0, 120)).slice(0, 4) } }
}
console.log('assertion file sha=' + H(join(REPO, TEST)))
const c0 = copyRepo()
const r0 = runTest(c0)
console.log('CONTROL (pristine copy) exit=' + r0.code + '  ' + r0.s + '  (copy sha == real: ' + (H(join(c0, TEST)) === H(join(REPO, TEST))) + ')')
rmSync(c0, { recursive: true, force: true })
const mutate = (tag, re, to) => {
  const d = copyRepo()
  const f = join(d, 'vibe-math-vmu/vibe-math-vmu.js')
  const s = readFileSync(f, 'utf8')
  if (!re.test(s)) { console.log('\n' + tag + ': ANCHOR MISSED -> mutant void'); rmSync(d, { recursive: true, force: true }); return }
  writeFileSync(f, s.replace(re, to))
  const r = runTest(d)
  console.log('\n' + tag + ' exit=' + r.code + '  ' + r.s)
  for (const l of r.fails || []) console.log('    ' + l)
  rmSync(d, { recursive: true, force: true })
}
mutate('M-A settings cannot ADD', /const activeFromSettings = Array\.isArray\(settings\['vmu\.packs\.active'\]\)[^\n]*\n/, 'const activeFromSettings = []\n')
mutate('M-R settings CAN remove (baseline replaced)', /const packsWanted = deploymentPacks\.slice\(\)/, 'const packsWanted = []')
mutate('M-B both-declared loads twice / source flips', /if \(packSourceOf\.has\(key\)\) continue[^\n]*\n/, 'if (false) continue\n')
