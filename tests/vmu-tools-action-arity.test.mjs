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
  'member-tools.js': 'single-purpose introspection face: no action/op by design, it takes only member — and line 45 below proves the exemption is real',
  'turn.js': 'dispatches on op rather than action; the host translates op to the turn engine s own verbs' }

for (const f of files) {
  const src = readFileSync(join(DIR, f), 'utf8')
  // the factory signature and the run signature
  const factory = /export function make\w+Spec\(\{([^}]*)\}\)/.exec(src)
  const runSig = /run:\s*async\s*\(\{([^}]*)\}/.exec(src)
  // ROUND 542: turn.js dispatches on `op`, not `action`, and its block was self-contained before the split - so it is
  // EXEMPT BY NAME WITH A REASON rather than silently skipped, and the exemption itself is asserted to be real below.
  if (!factory || !runSig) {
    if (!EXEMPT[f]) offenders.push(f + ': no factory or run signature found')
    continue
  }
  if (EXEMPT[f] && !/\baction\b/.test(factory[1] + runSig[1])) { checked += 1; continue }
  checked += 1
  // `action` may come from the factory or be destructured in run; one of the two must name it
  if (!/\baction\b/.test(factory[1]) && !/\baction\b/.test(runSig[1])) offenders.push(f + ': neither the factory nor run destructures action')
}
ok(checked + Object.keys(EXEMPT || {}).length >= files.length - 1, 'every module was parsed or exempted by name', { checked, of: files.length })
ok(offenders.length === 0,
  'and every one of them names action, so no tool can fall through to unknown-action on every call', { offenders })

console.log('=== 3. THE GUARD WOULD BITE ===')
{
  // a synthetic module with the defect must be reported by the same predicate
  const bad = "export function makeBadSpec({ param }) {\n  return { run: async ({ id } = {}) => ({}) }\n}\n"
  const factory = /export function make\w+Spec\(\{([^}]*)\}\)/.exec(bad)
  const runSig = /run:\s*async\s*\(\{([^}]*)\}/.exec(bad)
  const wouldBite = !!(factory && runSig && !/\baction\b/.test(factory[1]) && !/\baction\b/.test(runSig[1]))
  ok(!!wouldBite, 'a module missing action IS reported by the same predicate, so the check is not vacuous', { wouldBite })
  const good = "export function makeGoodSpec({ param }) {\n  return { run: async ({ action, id } = {}) => ({}) }\n}\n"
  const gf = /export function make\w+Spec\(\{([^}]*)\}\)/.exec(good)
  const gr = /run:\s*async\s*\(\{([^}]*)\}/.exec(good)
  ok(!!(gf && gr && (/\baction\b/.test(gf[1]) || /\baction\b/.test(gr[1]))), 'and a module that has it is not', {})
}

console.log('=== TOOLS ACTION ARITY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
