// tests/audit-surface-index.test.mjs - the four surface indexes must be current, and none may be vacuous.
//
// WHY. Each of these was hand-kept, and the hook list proved the cost: after I added budget/warn and member/self-report while
// fixing two live bugs, the middleware volume's heading still said twenty names while VU_HOOKS had twenty-two. The indexes are
// now generated into the volume that owns each surface - services in the interface contract, hooks in middleware, tools in the
// command reference, settings families in the settings volume - and this guard runs the generator in --check mode. It also
// asserts each block is substantive, because a generator that produced an empty table would satisfy "current" while telling a
// reader nothing.
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

console.log('=== 1. THE GENERATOR AND ITS TARGETS EXIST ===')
const gen = join(REPO, 'scripts', 'generate-surface-index.mjs')
ok(existsSync(gen), 'the surface-index generator is present')
const TARGETS = [
  ['03-interface-contract.md', 'service-index'],
  ['05-middleware.md', 'hook-index'],
  ['18-command-and-protocol-reference.md', 'tool-index'],
  ['04-settings.md', 'settings-index'],
  ['05-middleware.md', 'register-fields'],
  ['05-middleware.md', 'capability-list'],
]
for (const [f] of TARGETS) ok(existsSync(join(VMU, 'docs', f)), 'the volume exists: ' + f)

console.log('=== 2. EVERY GENERATED BLOCK IS PRESENT AND SUBSTANTIVE ===')
for (const [f, id] of TARGETS) {
  const t = readFileSync(join(VMU, 'docs', f), 'utf8')
  const a = t.indexOf('<!-- BEGIN GENERATED: ' + id + ' -->')
  const b = t.indexOf('<!-- END GENERATED: ' + id + ' -->')
  ok(a >= 0 && b > a, f + ' carries its delimited generated block')
  const block = a >= 0 && b > a ? t.slice(a, b) : ''
  // any table row counts: the tool index numbers its rows, the others start with a code name
  const rows = block.split('\n').filter((l) => /^\|/.test(l) && !/^\|[-: |]+\|$/.test(l)).length - 1 // minus the header
  ok(rows >= 3, f + ' block is substantive rather than an empty shell', { rows })
}

console.log('=== 3. AND EVERY BLOCK IS CURRENT ===')
let out = ''
let code = 0
try {
  out = execFileSync(process.execPath, [gen], { cwd: REPO, encoding: 'utf8' })
} catch (e) {
  code = e.status === undefined ? 1 : e.status
  out = String(e.stdout || '') + String(e.stderr || '')
}
ok(code === 0,
  'the four surface indexes match their code: run generate-surface-index.mjs --write after changing a service, a hook, a tool or a settings key',
  { code, out: out.trim().slice(0, 220) })

console.log('=== SURFACE INDEX: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
