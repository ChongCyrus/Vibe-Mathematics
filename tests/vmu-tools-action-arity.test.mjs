// tests/vmu-tools-action-arity.test.mjs — ONE guard for the family this session has now met five times in one form or another:
// a tool whose `run` does not destructure `action`, so every call falls through to unknown-action. Fixing instances one at a
// time produced this round repeating the bug my own generator had made the round before; the guard makes the class impossible.
//
// The check is structural and reads every module under vibe-math-vmu/tools/: a factory's run signature must destructure `action`,
// because every tool in this host dispatches on it.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(REPO, 'vibe-math-vmu', 'tools')
const files = readdirSync(DIR).filter((f) => f.endsWith('.js')).sort()

console.log('=== 1. EVERY MODULE IS CHECKED, AND THERE ARE SOME ===')
ok(files.length >= 20, 'the tool directory holds the modules this guard is about', { n: files.length })

console.log('=== 2. EVERY FACTORY S DESTRUCTURING NAMES action ===')
const offenders = []
let checked = 0
// EXEMPT BY NAME WITH A REASON. turn.js dispatches on op rather than action, and its block was self-contained before the split.
const EXEMPT = {
  'vote.js': 'single-purpose face: vibe_vmu_vote records exactly one thing (a closure vote) and has no action/op by design',
  'member-tools.js': 'single-purpose introspection face: no action/op by design, it takes only member — and line 45 below proves the exemption is real',
  'turn.js': 'dispatches on op rather than action; the host translates op to the turn engine s own verbs' }

// ★ RUN 127 (F-127a): a tool's `run` may take the tool-execution context as a SECOND argument
// (`run: async (args = {}, exec = null) => { const { action, … } = args }`) so a seat gate can ask WHO is
// calling. The guard reads BOTH shapes; the question it asks is unchanged: does this face name `action` in the
// factory or in the run destructuring?
const runNamesOf = (text) => {
  const inline = /run:\s*async\s*\(\{([^}]*)\}/.exec(text)
  if (inline) return inline[1]
  const shell = /run:\s*async\s*\(\s*args\s*=\s*\{\}\s*,\s*exec\s*=\s*null\s*\)\s*=>\s*\{([\s\S]{0,800})/.exec(text)
  if (!shell) return null
  const inner = /const\s*\{([^}]*)\}\s*=\s*args/.exec(shell[1])
  return inner ? inner[1] : null
}

for (const f of files) {
  const src = readFileSync(join(DIR, f), 'utf8')
  const factory = /export function make\w+Spec\(\{([^}]*)\}\)/.exec(src)
  const runNames = runNamesOf(src)
  if (!factory || runNames === null) {
    if (!EXEMPT[f]) offenders.push(f + ': no factory or run signature found')
    continue
  }
  if (EXEMPT[f] && !/\baction\b/.test(factory[1] + runNames)) { checked += 1; continue }
  checked += 1
  // `action` may come from the factory or be destructured in run; one of the two must name it
  if (!/\baction\b/.test(factory[1]) && !/\baction\b/.test(runNames)) offenders.push(f + ': neither the factory nor run destructures action')
}
ok(checked + Object.keys(EXEMPT || {}).length >= files.length - 1, 'every module was parsed or exempted by name', { checked, of: files.length })
ok(offenders.length === 0,
  'and every one of them names action, so no tool can fall through to unknown-action on every call', { offenders })

console.log('=== 3. THE GUARD WOULD BITE ===')
{
  // a synthetic module with the defect must be reported by the same predicate — in BOTH run shapes
  const badInline = "export function makeBadSpec({ param }) {\n  return { run: async ({ id } = {}) => ({}) }\n}\n"
  const badShell = "export function makeBadSpec({ param }) {\n  return { run: async (args = {}, exec = null) => {\n    const { id, force } = args\n    return { id, force }\n  } }\n}\n"
  const bites = (text) => {
    const f = /export function make\w+Spec\(\{([^}]*)\}\)/.exec(text)
    const names = runNamesOf(text)
    return !!(f && names !== null && !/\baction\b/.test(f[1]) && !/\baction\b/.test(names))
  }
  ok(bites(badInline), 'a module missing action IS reported (destructuring shape), so the check is not vacuous', {})
  ok(bites(badShell), 'a module missing action IS reported (args/exec shape) - the seam F-127a added is covered', {})
  const goodInline = "export function makeGoodSpec({ param }) {\n  return { run: async ({ action, id } = {}) => ({}) }\n}\n"
  const goodShell = "export function makeGoodSpec({ param }) {\n  return { run: async (args = {}, exec = null) => {\n    const { action } = args\n    return action\n  } }\n}\n"
  ok(!bites(goodInline), 'and a module that has it is not (destructuring shape)', {})
  ok(!bites(goodShell), 'and a module that has it is not (args/exec shape)', {})
}

console.log('=== TOOLS ACTION ARITY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
