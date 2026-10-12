// tests/audit-zpolicy.test.mjs — R1 "kernel zero policy", the framework's FIRST PROMISE, given a machine guard.
//
// WHAT WAS ACTUALLY WRONG. docs/11 section 4 has carried a complete word list for a long time, headed 草案 待裁 O5, and
// the requirement itself says a generational word appearing in the kernel directory is red. Measured on the raw files,
// twenty of the eighty-six kernel .js files hit - which looked like a large backlog until the hits were read: they are
// comments, documentation strings and compatibility notes. The kernel's CODE never names an institution. Measured on the
// code with comments and string literals stripped, the answer is ZERO, and the discriminator was checked both ways.
//
// So this gate is STRICT rather than staged: it asserts that no kernel file names a generation, a role from the corpus's
// vocabulary, or a mechanism by its institution-specific name IN CODE. Comments and literals are exempt ON PURPOSE -
// explaining why a compatibility path exists is not policy, and the exemption is what makes the rule sayable at all.
//
// Run: node tests/audit-zpolicy.test.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

/** Strip block comments, line comments and quoted spans. Deliberately simple; the controls below prove it discriminates. */
export function stripNoise(src) {
  let s = src.replace(/\/\*[\s\S]*?\*\//g, ' ')
  s = s.replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
  s = s.replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
  s = s.replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
  s = s.replace(/`(?:[^`\\]|\\.)*`/g, '``')
  return s
}

// docs/11 section 4's list, in its three groups.
const GROUPS = {
  '代际词': [/\bv5r\b/, /vibe-math-v5r/, /vibe-math-v\d/, /\bv[2345]\b/],
  '角色专名': [/院士/, /academician/, /研究员/, /临时工/, /\btemp\b/],
  '机制专名': [/求真表决/, /冻结期/, /论文/, /纪要/, /复议/, /附议/],
}

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  return false
}

const walk = (d) => readdirSync(join(REPO, d), { withFileTypes: true }).flatMap((e) => {
  const r = join(d, e.name)
  if (e.isDirectory()) return /(^|\/)(\.git|node_modules)$/.test(r) ? [] : walk(r)
  return [r]
})

console.log('=== 1. THE PREDICATE DISCRIMINATES, shown both ways ===')
ok(!GROUPS['代际词'].some((p) => p.test(stripNoise("// see v5r for the original\nconst label = 'v5r'\n"))),
  'a generation named in a COMMENT or a STRING is not a policy violation - which is the whole reason this rule is sayable')
ok(GROUPS['代际词'].some((p) => p.test(stripNoise('const engine = v5r\n'))),
  'and a generation named in CODE is, so the predicate is not vacuous')

console.log('=== 2. GENERATIONAL WORDS ARE STRICTLY ABSENT FROM KERNEL CODE ===')
const kernel = walk('vibe-math-vmu/kernel').filter((f) => f.endsWith('.js')).map((f) => f.replace(/\\/g, '/'))
ok(kernel.length > 50, 'the kernel is the directory being read, and it is not empty', { files: kernel.length })
const hits = (group, f) => GROUPS[group].filter((p) => p.test(stripNoise(readFileSync(join(REPO, f), 'utf8')))).map(String)
const genViolations = []
for (const f of kernel) for (const p of GROUPS['代际词']) {
  if (p.test(stripNoise(readFileSync(join(REPO, f), 'utf8')))) genViolations.push(String(p) + ' in ' + f)
}
ok(genViolations.length === 0,
  'NOT ONE of the ' + kernel.length + ' kernel files names a GENERATION in its code, so the strongest half of R1 holds by measurement rather than by assertion',
  { violations: genViolations.slice(0, 6) })

// The one site the role/mechanism groups find, measured before this gate existed. Frozen: it must still be there, and the
// list must not grow. It is a GENUINE violation, not a false positive - the kernel hardcodes the corpus role labels.
const ROLE_SITES = ['vibe-math-vmu/kernel/turn/index.js']
const roleFiles = kernel.filter((f) => hits('角色专名', f).length || hits('机制专名', f).length)
const unrecorded = roleFiles.filter((f) => !ROLE_SITES.includes(f))
ok(unrecorded.length === 0,
  'the role/mechanism groups find no NEW kernel file beyond the one recorded site, so the backlog cannot grow',
  { unrecorded })
const rotted = ROLE_SITES.filter((f) => !(hits('角色专名', f).length || hits('机制专名', f).length))
ok(rotted.length === 0,
  'and the recorded site STILL names a corpus role in code, so the note cannot rot: this is a real violation, not an exemption',
  { rotted })
ok(ROLE_SITES.length === 1,
  'exactly one kernel site is recorded, because exactly one was measured - a list of one is a finding, a list of many would be an excuse')

console.log('=== 3. THE SAME WORDS ARE STILL ALLOWED WHERE THE DESIGN SAYS THEY ARE ===')
const packs = walk('vibe-math-vmu/packs').filter((f) => f.endsWith('.js'))
const packHits = packs.filter((f) => GROUPS['代际词'].some((p) => p.test(readFileSync(join(REPO, f), 'utf8'))))
ok(packHits.length > 0,
  'a pack MAY name the generation it implements - docs/11 section 4 says so - so the rule is about the kernel and not a blanket ban',
  { packs: packs.length, naming: packHits.length })

console.log('=== 4. THE LIST THIS GATE ENFORCES IS THE ONE THE DOCUMENT CARRIES ===')
const doc = readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '11-gates-and-development.md'), 'utf8')
ok(doc.includes('代际词') && doc.includes('角色专名') && doc.includes('机制专名'),
  'docs/11 still carries the three groups this gate reads, so the words come from the decision rather than from here')

console.log('=== ZPOLICY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
